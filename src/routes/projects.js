import { Router } from 'express'
import { z } from 'zod'
import { query, transaction, audit } from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { emailRule } from './users.js'

const r = Router()
const dateRule = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD.')

// Admin sees every project; everyone else only the ones they lead or are a member of.
const visible = user => user.role === 'admin'
  ? { where: '1 = 1', params: [] }
  : { where: '(p.tl_id = ? OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ?))', params: [user.id, user.id] }

const SELECT = `
  SELECT p.id, p.name, p.client_company AS client, p.description, p.type, p.tl_id AS tlId, tl.name AS tl,
         p.start_date AS start, p.baseline_golive AS baseline, p.current_golive AS golive, p.phase, p.status,
         p.onboarded, p.track_from AS trackFrom, p.created_at AS createdAt
    FROM projects p JOIN users tl ON tl.id = p.tl_id`

r.get('/', async (req, res) => {
  const v = visible(req.user)
  res.json({ projects: await query(`${SELECT} WHERE ${v.where} ORDER BY p.status = 'completed', p.created_at DESC`, v.params) })
})

r.get('/:id', async (req, res) => {
  const v = visible(req.user)
  const [project] = await query(`${SELECT} WHERE p.id = ? AND ${v.where}`, [+req.params.id, ...v.params])
  if (!project) return res.status(404).json({ error: 'Project not found.' })
  const members = await query(`
    SELECT u.id, u.name, u.email, u.role, u.client_access AS clientAccess, u.status
      FROM project_members m JOIN users u ON u.id = m.user_id WHERE m.project_id = ? ORDER BY u.role = 'client', u.name`, [project.id])
  res.json({ project, members: req.user.role === 'client' ? members.map(({ email, status, ...m }) => m) : members })
})

// Staff the admin can put on a project.
r.get('/options/staff', requireRole('admin'), async (req, res) => {
  res.json({ staff: await query("SELECT id, name, role FROM users WHERE role <> 'client' AND status = 'active' ORDER BY name") })
})

r.post('/', requireRole('admin'), async (req, res) => {
  const b = z.object({
    name: z.string().trim().min(1, 'Project name is required.').max(160),
    client: z.string().trim().min(1, 'Client company is required.').max(160),
    description: z.string().trim().max(5000).optional(),
    type: z.enum(['fixed_scope', 'time_material', 'support']).default('fixed_scope'),
    start: dateRule.nullish(),
    tlId: z.number().int().positive(),
    team: z.array(z.number().int().positive()).min(1, 'Pick at least one team member.'),
    clients: z.array(z.object({ name: z.string().trim().min(1).max(120), email: emailRule, access: z.enum(['approver', 'viewer']) })).default([]),
  }).parse(req.body)

  const staff = await query("SELECT id, role FROM users WHERE status = 'active' AND role <> 'client' AND id IN (?" + ', ?'.repeat(b.team.length) + ')', [b.tlId, ...b.team])
  const ids = new Map(staff.map(s => [s.id, s.role]))
  if (ids.get(b.tlId) !== 'tl') return res.status(400).json({ error: 'Choose an active team lead.' })
  if (b.team.some(id => !ids.has(id))) return res.status(400).json({ error: 'One of the team members is not an active staff user.' })

  const id = await transaction(async db => {
    const out = await db.query(
      'INSERT INTO projects (name, client_company, description, type, tl_id, start_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [b.name, b.client, b.description || null, b.type, b.tlId, b.start || null, req.user.id])
    const pid = out.insertId
    const memberIds = new Set(b.team)

    // Client users are created as "invited": they cannot sign in until an admin sets a temporary password.
    for (const c of b.clients) {
      const [existing] = await db.query('SELECT id, role FROM users WHERE email = ?', [c.email])
      if (existing && existing.role !== 'client') throw Object.assign(new Error(`${c.email} belongs to a staff user, not a client.`), { status: 400 })
      memberIds.add(existing ? existing.id : (await db.query(
        "INSERT INTO users (name, email, role, client_access, status, created_by) VALUES (?, ?, 'client', ?, 'invited', ?)",
        [c.name, c.email, c.access, req.user.id])).insertId)
    }
    for (const uid of memberIds) await db.query('INSERT IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)', [pid, uid])
    await audit(db, req, 'project_created', 'project', pid, { name: b.name, client: b.client, tlId: b.tlId, members: [...memberIds] })
    return pid
  })
  res.status(201).json({ id })
})

export default r
