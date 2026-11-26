// Ticketing System. Tickets per project (numbered <PREFIX>-1, -2 …), attachments, comments,
// a start / pause / resume / stop timer per user, and a full history.
//   view   = see tickets, log time, comment
//   create = raise tickets, add attachments
//   edit   = edit any ticket, change status, delete. Assignees may also change status.
import { Router } from 'express'
import { z } from 'zod'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { query, transaction } from '../db.js'
import { requirePerm } from '../middleware/permissions.js'
import config from '../config.js'

const r = Router()

export const TYPES = ['bug', 'change', 'feature', 'improvement', 'task']
export const PRIORITIES = ['low', 'medium', 'high', 'critical']
export const STATUSES = ['open', 'in_progress', 'in_testing', 'completed']
export const REPORTERS = ['client', 'internal_testing', 'internal_team']
const LABEL = { open: 'Open', in_progress: 'In Progress', in_testing: 'In Testing', completed: 'Completed' }

const fail = (status, message) => Object.assign(new Error(message), { status })
const perms = req => req.perms.modules.tickets || {}
const inList = (ids, col = 'id') => `${col} IN (${ids.map(() => '?').join(',')})`

// ---------- attachments ----------
const DIR = path.resolve(config.uploadDir, '..', 'private_uploads', 'tickets')
fs.mkdirSync(DIR, { recursive: true })
const MAX_FILES = 10, MAX_MB = 15
const ALLOWED = /^(image\/(png|jpe?g|webp|gif|heic|heif)|application\/pdf|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/csv)$/
const upload = multer({
  storage: multer.diskStorage({
    destination: DIR,
    filename: (req, f, cb) => cb(null, `tk_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${path.extname(f.originalname).toLowerCase().slice(0, 10)}`),
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: MAX_FILES },
  fileFilter: (req, f, cb) => ALLOWED.test(f.mimetype) ? cb(null, true) : cb(fail(400, `“${f.originalname}” is not an image, PDF or Excel file.`)),
})
const receive = (req, res, next) => upload.array('files', MAX_FILES)(req, res, err => {
  if (!err) return next()
  next(fail(400, err.code === 'LIMIT_FILE_SIZE' ? `Each file must be ${MAX_MB} MB or smaller.`
    : ['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'].includes(err.code) ? `You can attach up to ${MAX_FILES} files at a time.` : err.message))
})
const dropFiles = files => (files || []).forEach(f => fs.rm(f.path, { force: true }, () => {}))
const isUrl = v => { try { return ['http:', 'https:'].includes(new URL(v).protocol) } catch { return false } }
// links arrive as a JSON string in multipart forms
const linksField = z.preprocess(v => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v.trim()) { try { return JSON.parse(v) } catch { return [v] } }
  return []
}, z.array(z.string().trim().max(1000)).max(20, 'At most 20 links.').transform(a => a.filter(Boolean))
  .refine(a => a.every(isUrl), 'Each link must be a full address starting with https://'))

async function addAttachments(tx, ticketId, userId, files, links) {
  for (const f of files || []) {
    await tx.query('INSERT INTO ticket_attachments (ticket_id, kind, stored_name, original_name, mime_type, size_bytes, uploaded_by) VALUES (?, "file", ?, ?, ?, ?, ?)',
      [ticketId, f.filename, f.originalname.slice(0, 255), f.mimetype, f.size, userId])
  }
  for (const u of links || []) await tx.query('INSERT INTO ticket_attachments (ticket_id, kind, url, uploaded_by) VALUES (?, "link", ?, ?)', [ticketId, u, userId])
}

const log = (db, ticketId, userId, action, detail = null) =>
  db.query('INSERT INTO ticket_activity (ticket_id, user_id, action, detail) VALUES (?, ?, ?, ?)', [ticketId, userId, action, detail ? String(detail).slice(0, 500) : null])

// "Travel Management App" -> "TMA", "Ramco" -> "RAMC"
export function prefixFor(name) {
  const words = (name.match(/[A-Za-z0-9]+/g) || ['TK'])
  const p = words.length >= 2 ? words.map(w => w[0]).join('').slice(0, 5) : words[0].slice(0, 4)
  return p.toUpperCase() || 'TK'
}

// ---------- body schemas ----------
const ids = z.preprocess(v => (typeof v === 'string' ? (v ? (v.startsWith('[') ? JSON.parse(v) : v.split(',')) : []) : v ?? []),
  z.array(z.coerce.number().int().positive()).max(50).transform(a => [...new Set(a)]))
const opt = max => z.preprocess(v => (v === '' || v == null ? null : v), z.string().trim().max(max).nullable())
const fields = {
  title: z.string().trim().min(1, 'Issue title is required.').max(200),
  description: opt(5000),
  type: z.enum(TYPES, { errorMap: () => ({ message: 'Pick a type.' }) }),
  priority: z.enum(PRIORITIES, { errorMap: () => ({ message: 'Pick a priority.' }) }),
  reported_by: z.enum(REPORTERS, { errorMap: () => ({ message: 'Pick who reported it.' }) }),
  reporter_name: opt(160),
  due_date: z.preprocess(v => (v === '' || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.').nullable()),
  assignee_ids: ids,
}
const createBody = z.object({ project_id: z.coerce.number().int().positive({ message: 'Pick a project.' }), ...fields, links: linksField })
const editBody = z.object(fields)

// ---------- helpers ----------
async function getTicket(id) {
  const [t] = await query('SELECT * FROM tickets WHERE id = ?', [id])
  if (!t) throw fail(404, 'Ticket not found.')
  return t
}
async function myEmployeeId(userId) {
  const [e] = await query('SELECT id FROM employees WHERE user_id = ? LIMIT 1', [userId])
  return e?.id || 0
}
async function isAssignee(ticketId, userId) {
  const [x] = await query('SELECT 1 FROM ticket_assignees a JOIN employees e ON e.id = a.employee_id WHERE a.ticket_id = ? AND e.user_id = ?', [ticketId, userId])
  return !!x
}
async function setAssignees(tx, ticketId, empIds) {
  if (empIds.length) {
    const found = await tx.query(`SELECT id FROM employees WHERE ${inList(empIds)}`, empIds)
    if (found.length !== empIds.length) throw fail(400, 'One of the assignees no longer exists.')
  }
  await tx.query('DELETE FROM ticket_assignees WHERE ticket_id = ?', [ticketId])
  for (const e of empIds) await tx.query('INSERT INTO ticket_assignees (ticket_id, employee_id) VALUES (?, ?)', [ticketId, e])
}

// Timer state for one user on one ticket: running (open segment), paused (last event pause) or idle.
async function timerState(db, ticketId, userId) {
  const [open] = await db.query(
    'SELECT id, TIMESTAMPDIFF(SECOND, started_at, NOW()) AS running_for FROM ticket_time_logs WHERE ticket_id = ? AND user_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1', [ticketId, userId])
  const [last] = await db.query("SELECT action FROM ticket_time_events WHERE ticket_id = ? AND user_id = ? AND action <> 'manual' ORDER BY id DESC LIMIT 1", [ticketId, userId])
  // Time of the current work session (since the last start), so the clock carries on after pause / resume.
  const [st] = await db.query("SELECT MAX(at) AS at FROM ticket_time_events WHERE ticket_id = ? AND user_id = ? AND action = 'start'", [ticketId, userId])
  const [sess] = st?.at ? await db.query(
    `SELECT COALESCE(SUM(CASE WHEN ended_at IS NULL THEN TIMESTAMPDIFF(SECOND, started_at, NOW()) ELSE seconds END), 0) AS s
       FROM ticket_time_logs WHERE ticket_id = ? AND user_id = ? AND source = 'timer' AND started_at >= ? - INTERVAL 1 SECOND`, [ticketId, userId, st.at]) : [{ s: 0 }]
  const state = open ? 'running' : last?.action === 'pause' ? 'paused' : 'idle'
  return { state, session_seconds: state === 'idle' ? 0 : Number(sess.s), running_for: open ? Number(open.running_for) : 0 }
}

// ---------- routes ----------

// Pick lists.
r.get('/options', requirePerm('tickets', 'view'), async (req, res) => {
  const [projects, employees] = await Promise.all([
    query("SELECT id, name, client_name, status FROM project_master ORDER BY status = 'active' DESC, name"),
    query("SELECT e.id, e.name, e.emp_no, e.photo, r.name AS role_name FROM employees e LEFT JOIN roles r ON r.id = e.role_id WHERE e.status NOT IN ('resigned','terminated') ORDER BY e.name"),
  ])
  res.json({ projects: projects.map(p => ({ ...p, prefix: prefixFor(p.name) })), employees, types: TYPES, priorities: PRIORITIES, statuses: STATUSES, reporters: REPORTERS })
})

// The signed-in user's running / paused timers (shown again after signing back in).
r.get('/timers/mine', requirePerm('tickets', 'view'), async (req, res) => {
  const rows = await query(
    `SELECT DISTINCT t.id, t.ticket_no, t.title FROM ticket_time_events ev JOIN tickets t ON t.id = ev.ticket_id
      WHERE ev.user_id = ? AND ev.id = (SELECT MAX(id) FROM ticket_time_events WHERE ticket_id = ev.ticket_id AND user_id = ev.user_id AND action <> 'manual')
        AND ev.action IN ('start','resume','pause')`, [req.user.id])
  const out = []
  for (const t of rows) out.push({ ...t, ...(await timerState({ query }, t.id, req.user.id)) })
  res.json({ timers: out })
})

// List with counts per status. Filters: project_id, type, status, priority, q, mine=1; sort=desc|asc.
r.get('/', requirePerm('tickets', 'view'), async (req, res) => {
  const where = [], params = []
  const q = req.query
  if (Number(q.project_id)) { where.push('t.project_id = ?'); params.push(Number(q.project_id)) }
  if (TYPES.includes(q.type)) { where.push('t.type = ?'); params.push(q.type) }
  if (PRIORITIES.includes(q.priority)) { where.push('t.priority = ?'); params.push(q.priority) }
  if (q.q?.trim()) { where.push('(t.ticket_no LIKE ? OR t.title LIKE ?)'); params.push(`%${q.q.trim()}%`, `%${q.q.trim()}%`) }
  if (q.mine === '1') {
    where.push('(t.created_by = ? OR EXISTS (SELECT 1 FROM ticket_assignees a JOIN employees e ON e.id = a.employee_id WHERE a.ticket_id = t.id AND e.user_id = ?))')
    params.push(req.user.id, req.user.id)
  }
  const base = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const countRows = await query(`SELECT t.status, COUNT(*) AS n FROM tickets t ${base} GROUP BY t.status`, params)
  const counts = Object.fromEntries(STATUSES.map(s => [s, 0]))
  for (const c of countRows) counts[c.status] = Number(c.n)

  const w2 = [...where], p2 = [...params]
  if (STATUSES.includes(q.status)) { w2.push('t.status = ?'); p2.push(q.status) }
  const rows = await query(
    `SELECT t.id, t.ticket_no, t.title, t.type, t.priority, t.status, t.reported_by, t.due_date, t.created_at, t.updated_at,
            p.name AS project_name,
            (SELECT COALESCE(SUM(CASE WHEN ended_at IS NULL THEN TIMESTAMPDIFF(SECOND, started_at, NOW()) ELSE seconds END), 0) FROM ticket_time_logs WHERE ticket_id = t.id) AS seconds,
            (SELECT COUNT(*) FROM ticket_comments WHERE ticket_id = t.id) AS comments,
            (SELECT COUNT(*) FROM ticket_attachments WHERE ticket_id = t.id) AS attachments
       FROM tickets t JOIN project_master p ON p.id = t.project_id
       ${w2.length ? `WHERE ${w2.join(' AND ')}` : ''}
      ORDER BY t.created_at ${q.sort === 'asc' ? 'ASC' : 'DESC'}, t.id ${q.sort === 'asc' ? 'ASC' : 'DESC'}`, p2)
  const tids = rows.map(t => t.id)
  const asg = tids.length ? await query(
    `SELECT a.ticket_id, e.id, e.name, e.photo FROM ticket_assignees a JOIN employees e ON e.id = a.employee_id WHERE ${inList(tids, 'a.ticket_id')} ORDER BY e.name`, tids) : []
  const by = new Map()
  for (const a of asg) by.set(a.ticket_id, [...(by.get(a.ticket_id) || []), { id: a.id, name: a.name, photo: a.photo }])
  res.json({ counts, total: Object.values(counts).reduce((a, b) => a + b, 0), tickets: rows.map(t => ({ ...t, seconds: Number(t.seconds), assignees: by.get(t.id) || [] })) })
})

// Raise a ticket (multipart: fields, files[], links JSON).
r.post('/', requirePerm('tickets', 'create'), receive, async (req, res) => {
  try {
    const b = createBody.parse(req.body)
    const out = await transaction(async tx => {
      const [p] = await tx.query('SELECT id, name FROM project_master WHERE id = ? FOR UPDATE', [b.project_id])
      if (!p) throw fail(400, 'That project no longer exists.')
      const [m] = await tx.query('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM tickets WHERE project_id = ?', [p.id])
      const seq = Number(m.next)
      let ticketNo = `${prefixFor(p.name)}-${seq}`
      const [clash] = await tx.query('SELECT id FROM tickets WHERE ticket_no = ?', [ticketNo])
      if (clash) ticketNo = `${prefixFor(p.name)}${p.id}-${seq}` // two projects with the same initials
      const { insertId } = await tx.query(
        `INSERT INTO tickets (project_id, seq, ticket_no, title, description, type, priority, reported_by, reporter_name, due_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, seq, ticketNo, b.title, b.description, b.type, b.priority, b.reported_by, b.reporter_name, b.due_date, req.user.id])
      await setAssignees(tx, insertId, b.assignee_ids)
      await addAttachments(tx, insertId, req.user.id, req.files, b.links)
      await log(tx, insertId, req.user.id, 'created', ticketNo)
      return { id: insertId, ticket_no: ticketNo }
    })
    res.status(201).json(out)
  } catch (e) { dropFiles(req.files); throw e }
})

// Full detail.
r.get('/:id', requirePerm('tickets', 'view'), async (req, res) => {
  const t = await getTicket(req.params.id)
  const id = t.id
  const [[proj], assignees, attachments, comments, logs, events, activity, [creator]] = await Promise.all([
    query('SELECT name, client_name FROM project_master WHERE id = ?', [t.project_id]),
    query('SELECT e.id, e.name, e.emp_no, e.photo, e.user_id, r.name AS role_name FROM ticket_assignees a JOIN employees e ON e.id = a.employee_id LEFT JOIN roles r ON r.id = e.role_id WHERE a.ticket_id = ? ORDER BY e.name', [id]),
    query('SELECT a.id, a.kind, a.original_name, a.mime_type, a.size_bytes, a.url, a.created_at, u.name AS uploaded_by_name FROM ticket_attachments a LEFT JOIN users u ON u.id = a.uploaded_by WHERE a.ticket_id = ? ORDER BY a.id', [id]),
    query(`SELECT c.id, c.body, c.source, c.created_at, c.user_id, u.name AS user_name, e.photo, r.name AS role_name
             FROM ticket_comments c JOIN users u ON u.id = c.user_id LEFT JOIN employees e ON e.user_id = c.user_id LEFT JOIN roles r ON r.id = e.role_id
            WHERE c.ticket_id = ? ORDER BY c.id`, [id]),
    query(`SELECT l.id, l.user_id, l.started_at, l.ended_at, l.source, l.note,
                  CASE WHEN l.ended_at IS NULL THEN TIMESTAMPDIFF(SECOND, l.started_at, NOW()) ELSE l.seconds END AS seconds,
                  u.name AS user_name, e.photo, r.name AS role_name
             FROM ticket_time_logs l JOIN users u ON u.id = l.user_id LEFT JOIN employees e ON e.user_id = l.user_id LEFT JOIN roles r ON r.id = e.role_id
            WHERE l.ticket_id = ? ORDER BY l.started_at DESC, l.id DESC`, [id]),
    query(`SELECT ev.id, ev.user_id, ev.action, ev.at, ev.note, u.name AS user_name FROM ticket_time_events ev JOIN users u ON u.id = ev.user_id
            WHERE ev.ticket_id = ? ORDER BY ev.id`, [id]),
    query('SELECT a.id, a.action, a.detail, a.at, u.name AS user_name FROM ticket_activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.ticket_id = ? ORDER BY a.id', [id]),
    query('SELECT name FROM users WHERE id = ?', [t.created_by]),
  ])
  // Per-user totals.
  const per = new Map()
  for (const l of logs) {
    const x = per.get(l.user_id) || { user_id: l.user_id, user_name: l.user_name, photo: l.photo, role_name: l.role_name, seconds: 0, sessions: 0, starts: 0, pauses: 0, resumes: 0, stops: 0 }
    x.seconds += Number(l.seconds); x.sessions++
    per.set(l.user_id, x)
  }
  for (const ev of events) {
    const x = per.get(ev.user_id)
    if (x && ev.action !== 'manual') x[`${ev.action}s`]++
  }
  const p = perms(req)
  const assignee = assignees.some(a => a.user_id === req.user.id)
  res.json({
    ticket: { ...t, project_name: proj?.name, client_name: proj?.client_name, created_by_name: creator?.name || null },
    assignees, attachments, comments,
    time_logs: logs.map(l => ({ ...l, seconds: Number(l.seconds) })),
    time_events: events,
    per_user: [...per.values()].sort((a, b) => b.seconds - a.seconds),
    total_seconds: logs.reduce((s, l) => s + Number(l.seconds), 0),
    activity,
    my_timer: await timerState({ query }, id, req.user.id),
    can: {
      edit: !!p.edit || t.created_by === req.user.id,
      status: !!p.edit || assignee || t.created_by === req.user.id,
      attach: !!p.create || !!p.edit || assignee,
      delete: !!p.edit,
    },
  })
})

// Edit details.
r.put('/:id', requirePerm('tickets', 'view'), async (req, res) => {
  const t = await getTicket(req.params.id)
  if (!perms(req).edit && t.created_by !== req.user.id) throw fail(403, 'Only the person who raised this ticket or an editor can change it.')
  const b = editBody.parse(req.body)
  await transaction(async tx => {
    await tx.query('UPDATE tickets SET title = ?, description = ?, type = ?, priority = ?, reported_by = ?, reporter_name = ?, due_date = ? WHERE id = ?',
      [b.title, b.description, b.type, b.priority, b.reported_by, b.reporter_name, b.due_date, t.id])
    await setAssignees(tx, t.id, b.assignee_ids)
    const changed = []
    if (t.priority !== b.priority) changed.push(`priority ${t.priority} → ${b.priority}`)
    if (t.type !== b.type) changed.push(`type ${t.type} → ${b.type}`)
    if (t.title !== b.title) changed.push('title')
    if ((t.description || null) !== b.description) changed.push('description')
    await log(tx, t.id, req.user.id, 'edited', changed.join(', ') || 'details')
  })
  res.json({ ok: true })
})

// Status (editors, assignees, or whoever raised it).
r.post('/:id/status', requirePerm('tickets', 'view'), async (req, res) => {
  const { status } = z.object({ status: z.enum(STATUSES) }).parse(req.body)
  const t = await getTicket(req.params.id)
  if (!perms(req).edit && t.created_by !== req.user.id && !(await isAssignee(t.id, req.user.id))) throw fail(403, 'Only assignees, the person who raised it or an editor can change the status.')
  if (t.status === status) return res.json({ ok: true })
  await query('UPDATE tickets SET status = ?, completed_at = ? WHERE id = ?', [status, status === 'completed' ? new Date() : null, t.id])
  await log({ query }, t.id, req.user.id, 'status', `${LABEL[t.status]} → ${LABEL[status]}`)
  res.json({ ok: true })
})

r.delete('/:id', requirePerm('tickets', 'edit'), async (req, res) => {
  const t = await getTicket(req.params.id)
  const files = await query("SELECT stored_name FROM ticket_attachments WHERE ticket_id = ? AND kind = 'file'", [t.id])
  await query('DELETE FROM tickets WHERE id = ?', [t.id])
  files.forEach(f => fs.rm(path.join(DIR, path.basename(f.stored_name)), { force: true }, () => {}))
  res.json({ ok: true })
})

// Attachments.
r.post('/:id/attachments', requirePerm('tickets', 'view'), receive, async (req, res) => {
  try {
    const t = await getTicket(req.params.id)
    const p = perms(req)
    if (!p.create && !p.edit && !(await isAssignee(t.id, req.user.id))) throw fail(403, 'You cannot add attachments to this ticket.')
    const links = linksField.parse(req.body.links)
    if (!req.files?.length && !links.length) throw fail(400, 'Choose a file or enter a link.')
    await transaction(async tx => {
      await addAttachments(tx, t.id, req.user.id, req.files, links)
      await log(tx, t.id, req.user.id, 'attached', [...(req.files || []).map(f => f.originalname), ...links].join(', '))
    })
    res.status(201).json({ ok: true })
  } catch (e) { dropFiles(req.files); throw e }
})

r.delete('/:id/attachments/:aid', requirePerm('tickets', 'view'), async (req, res) => {
  const [a] = await query('SELECT * FROM ticket_attachments WHERE id = ? AND ticket_id = ?', [req.params.aid, req.params.id])
  if (!a) throw fail(404, 'Attachment not found.')
  if (!perms(req).edit && a.uploaded_by !== req.user.id) throw fail(403, 'Only the person who added it or an editor can remove it.')
  await query('DELETE FROM ticket_attachments WHERE id = ?', [a.id])
  if (a.stored_name) fs.rm(path.join(DIR, path.basename(a.stored_name)), { force: true }, () => {})
  await log({ query }, a.ticket_id, req.user.id, 'removed attachment', a.original_name || a.url)
  res.json({ ok: true })
})

r.get('/files/:aid', requirePerm('tickets', 'view'), async (req, res) => {
  const [a] = await query("SELECT * FROM ticket_attachments WHERE id = ? AND kind = 'file'", [req.params.aid])
  const file = a && path.join(DIR, path.basename(a.stored_name))
  if (!a || !fs.existsSync(file)) return res.status(404).json({ error: 'File not found.' })
  res.setHeader('Content-Type', a.mime_type)
  res.setHeader('Content-Disposition', `${req.query.download || !/^(image\/|application\/pdf)/.test(a.mime_type) ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(a.original_name)}`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.sendFile(file)
})

// Comments.
r.post('/:id/comments', requirePerm('tickets', 'view'), async (req, res) => {
  const { body } = z.object({ body: z.string().trim().min(1, 'Write a comment.').max(5000) }).parse(req.body)
  const t = await getTicket(req.params.id)
  const { insertId } = await query('INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?, ?, ?)', [t.id, req.user.id, body])
  res.status(201).json({ id: insertId })
})

// Timer: start / pause / resume / stop. One running timer per person across all tickets.
r.post('/:id/timer', requirePerm('tickets', 'view'), async (req, res) => {
  const b = z.object({ action: z.enum(['start', 'pause', 'resume', 'stop']), note: opt(1000) }).parse(req.body)
  const t = await getTicket(req.params.id)
  const out = await transaction(async tx => {
    await tx.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.user.id]) // one click at a time per person
    const s = await timerState(tx, t.id, req.user.id)
    const closeOpen = () => tx.query('UPDATE ticket_time_logs SET ended_at = NOW(), seconds = TIMESTAMPDIFF(SECOND, started_at, NOW()) WHERE ticket_id = ? AND user_id = ? AND ended_at IS NULL', [t.id, req.user.id])
    const openNew = async () => {
      const [other] = await tx.query(
        'SELECT t.ticket_no FROM ticket_time_logs l JOIN tickets t ON t.id = l.ticket_id WHERE l.user_id = ? AND l.ended_at IS NULL AND l.ticket_id <> ? LIMIT 1', [req.user.id, t.id])
      if (other) throw fail(409, `Your timer is running on ${other.ticket_no}. Pause or stop it first.`)
      await tx.query('INSERT INTO ticket_time_logs (ticket_id, user_id, started_at, source) VALUES (?, ?, NOW(), "timer")', [t.id, req.user.id])
    }
    const event = () => tx.query('INSERT INTO ticket_time_events (ticket_id, user_id, action, note) VALUES (?, ?, ?, ?)', [t.id, req.user.id, b.action, b.note])

    if (b.action === 'start') {
      if (s.state !== 'idle') throw fail(409, s.state === 'running' ? 'Your timer is already running on this ticket.' : 'Your timer is paused. Resume it instead.')
      await openNew(); await event()
      if (t.status === 'open') {
        await tx.query("UPDATE tickets SET status = 'in_progress' WHERE id = ?", [t.id])
        await log(tx, t.id, req.user.id, 'status', 'Open → In Progress (timer started)')
      }
    } else if (b.action === 'pause') {
      if (s.state !== 'running') throw fail(409, 'The timer is not running.')
      await closeOpen(); await event()
    } else if (b.action === 'resume') {
      if (s.state !== 'paused') throw fail(409, s.state === 'running' ? 'The timer is already running.' : 'Start the timer first.')
      await openNew(); await event()
    } else {
      if (s.state === 'idle') throw fail(409, 'The timer is not running.')
      await closeOpen(); await event()
      if (b.note) {
        // The note goes on the last stretch of this session and into the comments.
        await tx.query('UPDATE ticket_time_logs SET note = ? WHERE ticket_id = ? AND user_id = ? AND source = "timer" ORDER BY id DESC LIMIT 1', [b.note, t.id, req.user.id])
        await tx.query('INSERT INTO ticket_comments (ticket_id, user_id, body, source) VALUES (?, ?, ?, "time_note")', [t.id, req.user.id, b.note])
      }
    }
    return timerState(tx, t.id, req.user.id)
  })
  res.json(out)
})

// Log time by hand (forgot to start the timer).
r.post('/:id/time', requirePerm('tickets', 'view'), async (req, res) => {
  const b = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.'),
    minutes: z.coerce.number().int().min(1, 'Enter the time spent.').max(24 * 60, 'At most 24 hours in one entry.'),
    note: opt(1000),
  }).parse(req.body)
  const t = await getTicket(req.params.id)
  const today = new Date(Date.now() + config.attendance.tzOffsetMinutes * 60000).toISOString().slice(0, 10)
  if (b.date > today) throw fail(400, 'You cannot log time for a future date.')
  // Hand-logged time is filed at 09:00 office time on that date (stored as UTC).
  const hand = new Date(Date.parse(`${b.date}T09:00:00Z`) - config.attendance.tzOffsetMinutes * 60000).toISOString().slice(0, 19).replace('T', ' ')
  await transaction(async tx => {
    await tx.query('INSERT INTO ticket_time_logs (ticket_id, user_id, started_at, ended_at, seconds, source, note) VALUES (?, ?, ?, ?, ?, "manual", ?)',
      [t.id, req.user.id, hand, hand, b.minutes * 60, b.note])
    await tx.query('INSERT INTO ticket_time_events (ticket_id, user_id, action, note) VALUES (?, ?, "manual", ?)', [t.id, req.user.id, `${b.minutes} min on ${b.date}${b.note ? ` · ${b.note}` : ''}`])
    if (b.note) await tx.query('INSERT INTO ticket_comments (ticket_id, user_id, body, source) VALUES (?, ?, ?, "time_note")', [t.id, req.user.id, b.note])
  })
  res.status(201).json({ ok: true })
})

export default r
