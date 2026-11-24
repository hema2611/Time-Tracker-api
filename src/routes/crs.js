import { Router } from 'express'
import { z } from 'zod'
import config from '../config.js'
import { query, transaction, audit } from '../db.js'
import { aiReady, readMessages, friendlyAiError } from '../ai/index.js'

// Mounted at /api/projects/:id — Inbox (pasted messages) and change requests.
const r = Router({ mergeParams: true })
const db = { query }

// Read: admin, team lead, members. Write: admin or the team lead.
async function loadProject(req, res, next) {
  const [p] = await query(
    'SELECT p.id, p.name, p.client_company AS client, p.tl_id, EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ?) AS member FROM projects p WHERE p.id = ?',
    [req.user.id, +req.params.id])
  const canWrite = p && (req.user.role === 'admin' || p.tl_id === req.user.id)
  if (!p || !(canWrite || p.member)) return res.status(404).json({ error: 'Project not found.' })
  req.project = p
  req.canWrite = canWrite
  next()
}
const writer = (req, res, next) => req.canWrite ? next() : res.status(403).json({ error: 'Only the admin or the team lead can do this.' })
// Only for this router's own paths, so other /api/projects/... routes pass through untouched.
r.use(['/inbox', '/crs'], loadProject)

// ---------- Inbox ----------
r.get('/inbox', async (req, res) => {
  res.json({ items: await query(`
    SELECT i.id, i.source, i.kind, i.title, i.detail, i.said_by AS saidBy, i.said_at AS saidAt, i.quote, i.confidence, i.status,
           i.cr_id AS crId, c.number AS crNumber, i.created_at AS createdAt, u.name AS addedBy
      FROM inbox_items i JOIN users u ON u.id = i.created_by LEFT JOIN change_requests c ON c.id = i.cr_id
     WHERE i.project_id = ? ORDER BY i.status = 'pending' DESC, i.id DESC LIMIT 300`, [req.project.id]) })
})

// Paste messages: the AI suggests what to track. Nothing becomes a CR until someone accepts it.
r.post('/inbox', writer, async (req, res) => {
  const b = z.object({
    text: z.string().trim().min(5, 'Paste at least one message.').max(40000, 'That is too much text at once. Paste up to about a week of chat.'),
    source: z.enum(['whatsapp', 'email', 'call', 'meeting', 'other']).default('whatsapp'),
  }).parse(req.body)
  if (!aiReady()) return res.status(503).json({ error: 'AI reading is not set up on the server yet.' })
  const [{ n }] = await query("SELECT COUNT(*) AS n FROM ai_usage WHERE user_id = ? AND purpose = 'inbox_read' AND created_at >= CURDATE()", [req.user.id])
  if (n >= config.ai.dailyChatLimitPerUser) return res.status(429).json({ error: 'You have reached today\'s limit for reading messages. Try again tomorrow.' })

  const log = (status, o = {}) => query(
    "INSERT INTO ai_usage (user_id, project_id, purpose, provider, model, status, input_tokens, output_tokens, error) VALUES (?, ?, 'inbox_read', ?, ?, ?, ?, ?, ?)",
    [req.user.id, req.project.id, config.ai.provider, o.model || config.ai.geminiModel, status, o.inputTokens ?? null, o.outputTokens ?? null, o.error ?? null])
  let out
  try { out = await readMessages({ project: { name: req.project.name, client: req.project.client }, text: b.text }); await log('ok', out) } catch (err) {
    console.error(`inbox read failed (project ${req.project.id}): ${err?.status ?? ''} ${String(err?.message || err).slice(0, 300)}`)
    await log('failed', { error: String(err?.message || err).slice(0, 300) })
    return res.status(502).json({ error: friendlyAiError(err) })
  }
  if (!out.data.length) return res.json({ added: 0 })
  await query(
    `INSERT INTO inbox_items (project_id, source, kind, title, detail, said_by, said_at, quote, confidence, created_by) VALUES ${out.data.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
    out.data.flatMap(x => [req.project.id, b.source, x.kind, x.title, x.detail || null, x.saidBy || null, x.saidAt || null, x.quote, x.confidence, req.user.id]))
  await audit(db, req, 'inbox_read', 'project', req.project.id, { source: b.source, items: out.data.length })
  res.status(201).json({ added: out.data.length })
})

// Accept: turns the item into the next CR number (the title can be edited first). Reject: keeps it, marked rejected.
r.post('/inbox/:itemId/decide', writer, async (req, res) => {
  const b = z.object({ action: z.enum(['accept', 'reject']), title: z.string().trim().min(1).max(255).optional(), type: z.enum(['new', 'change', 'revert']).default('new') }).parse(req.body)
  const out = await transaction(async t => {
    const [item] = await t.query('SELECT * FROM inbox_items WHERE id = ? AND project_id = ? FOR UPDATE', [+req.params.itemId, req.project.id])
    if (!item) throw Object.assign(new Error('Item not found.'), { status: 404 })
    if (item.status !== 'pending') throw Object.assign(new Error('This item was already handled.'), { status: 409 })
    if (b.action === 'reject') {
      await t.query("UPDATE inbox_items SET status = 'rejected', decided_by = ?, decided_at = NOW() WHERE id = ?", [req.user.id, item.id])
      await audit(t, req, 'inbox_rejected', 'inbox_item', item.id)
      return { status: 'rejected' }
    }
    // Bugs, decisions and promises are kept as a record; only change requests get a CR number.
    if (item.kind !== 'cr') {
      await t.query("UPDATE inbox_items SET status = 'accepted', title = ?, decided_by = ?, decided_at = NOW() WHERE id = ?", [b.title || item.title, req.user.id, item.id])
      await audit(t, req, 'inbox_kept', 'inbox_item', item.id)
      return { status: 'accepted' }
    }
    const [{ next }] = await t.query('SELECT COALESCE(MAX(number), 0) + 1 AS next FROM change_requests WHERE project_id = ? FOR UPDATE', [req.project.id])
    const { insertId: crId } = await t.query(
      'INSERT INTO change_requests (project_id, number, title, description, type, source, evidence, raised_by_name, raised_on, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.project.id, next, b.title || item.title, item.detail, b.type, item.source, item.quote, item.said_by, item.said_at, req.user.id])
    await t.query("INSERT INTO cr_history (cr_id, user_id, to_status, note) VALUES (?, ?, 'raised', ?)", [crId, req.user.id, `Created from ${item.source} message`])
    await t.query("UPDATE inbox_items SET status = 'accepted', cr_id = ?, decided_by = ?, decided_at = NOW() WHERE id = ?", [crId, req.user.id, item.id])
    await audit(t, req, 'cr_created', 'change_request', crId, { number: next, fromInbox: item.id })
    return { status: 'accepted', crId, number: next }
  })
  res.json(out)
})

// ---------- Change requests ----------
const CR_SELECT = `
  SELECT c.id, c.number, c.title, c.description, c.type, c.source, c.evidence, c.raised_by_name AS raisedBy, c.raised_on AS raisedOn,
         c.status, c.effort_days AS effortDays, c.chargeable, c.created_at AS createdAt, c.updated_at AS updatedAt, u.name AS createdBy
    FROM change_requests c JOIN users u ON u.id = c.created_by`

r.get('/crs', async (req, res) => {
  res.json({ crs: await query(`${CR_SELECT} WHERE c.project_id = ? ORDER BY c.number DESC`, [req.project.id]) })
})

r.get('/crs/:crId', async (req, res) => {
  const [cr] = await query(`${CR_SELECT} WHERE c.project_id = ? AND c.id = ?`, [req.project.id, +req.params.crId])
  if (!cr) return res.status(404).json({ error: 'Change request not found.' })
  const history = await query(
    'SELECT h.from_status AS fromStatus, h.to_status AS toStatus, h.note, h.created_at AS at, u.name AS byName FROM cr_history h JOIN users u ON u.id = h.user_id WHERE h.cr_id = ? ORDER BY h.id', [cr.id])
  res.json({ cr, history })
})

// Raise a CR by hand (from a call or meeting, or typed in).
r.post('/crs', writer, async (req, res) => {
  const b = z.object({
    title: z.string().trim().min(1, 'Give the change a title.').max(255),
    description: z.string().trim().max(5000).optional(),
    type: z.enum(['new', 'change', 'revert']).default('new'),
    source: z.enum(['whatsapp', 'email', 'call', 'meeting', 'portal', 'other']).default('other'),
    raisedBy: z.string().trim().max(120).optional(),
  }).parse(req.body)
  const out = await transaction(async t => {
    const [{ next }] = await t.query('SELECT COALESCE(MAX(number), 0) + 1 AS next FROM change_requests WHERE project_id = ? FOR UPDATE', [req.project.id])
    const { insertId } = await t.query(
      'INSERT INTO change_requests (project_id, number, title, description, type, source, raised_by_name, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.project.id, next, b.title, b.description || null, b.type, b.source, b.raisedBy || null, req.user.id])
    await t.query("INSERT INTO cr_history (cr_id, user_id, to_status, note) VALUES (?, ?, 'raised', 'Created by hand')", [insertId, req.user.id])
    await audit(t, req, 'cr_created', 'change_request', insertId, { number: next })
    return { id: insertId, number: next }
  })
  res.status(201).json(out)
})

// Allowed moves. Closed, rejected and cancelled are final: a later change is a new CR.
const NEXT = {
  raised: ['estimated', 'rejected', 'cancelled'],
  estimated: ['approved', 'rejected', 'cancelled'],
  approved: ['in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: ['closed', 'in_progress'],
}
r.post('/crs/:crId/status', writer, async (req, res) => {
  const b = z.object({
    to: z.enum(['estimated', 'approved', 'in_progress', 'done', 'closed', 'rejected', 'cancelled']),
    note: z.string().trim().max(500).optional(),
    effortDays: z.number().min(0.5).max(2000).optional(),
    chargeable: z.boolean().optional(),
  }).parse(req.body)
  await transaction(async t => {
    const [cr] = await t.query('SELECT id, status, effort_days FROM change_requests WHERE id = ? AND project_id = ? FOR UPDATE', [+req.params.crId, req.project.id])
    if (!cr) throw Object.assign(new Error('Change request not found.'), { status: 404 })
    if (!(NEXT[cr.status] || []).includes(b.to)) throw Object.assign(new Error(`A ${cr.status.replace('_', ' ')} change request cannot move to ${b.to.replace('_', ' ')}.`), { status: 400 })
    if (b.to === 'estimated' && !b.effortDays) throw Object.assign(new Error('Enter the effort in days.'), { status: 400 })
    if (['rejected', 'cancelled'].includes(b.to) && !b.note) throw Object.assign(new Error('Give a reason.'), { status: 400 })
    await t.query('UPDATE change_requests SET status = ?, effort_days = COALESCE(?, effort_days), chargeable = COALESCE(?, chargeable) WHERE id = ?',
      [b.to, b.effortDays ?? null, b.chargeable === undefined ? null : +b.chargeable, cr.id])
    await t.query('INSERT INTO cr_history (cr_id, user_id, from_status, to_status, note) VALUES (?, ?, ?, ?, ?)',
      [cr.id, req.user.id, cr.status, b.to, b.note || (b.effortDays ? `Effort ${b.effortDays} days` : null)])
    await audit(t, req, 'cr_status', 'change_request', cr.id, { from: cr.status, to: b.to })
  })
  res.json({ ok: true })
})

export default r
