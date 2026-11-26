// Project Repository: drive links per project, with an optional description.
//   view = see the links, create = add one, edit = change or remove one
import { Router } from 'express'
import { z } from 'zod'
import { query } from '../db.js'
import { requirePerm } from '../middleware/permissions.js'

const r = Router()

const schema = z.object({
  project_id: z.coerce.number().int().positive({ message: 'Pick a project.' }),
  drive_link: z.string().trim().min(1, 'Drive link is required.').max(1000)
    .refine(v => { try { return ['http:', 'https:'].includes(new URL(v).protocol) } catch { return false } },
      'Enter a full link starting with https://'),
  description: z.string().trim().max(2000).optional().nullable(),
})

async function assertProject(id) {
  const [p] = await query('SELECT id FROM project_master WHERE id = ?', [id])
  if (!p) throw Object.assign(new Error('That project no longer exists.'), { status: 400 })
}

// Projects to pick from (so this screen works without access to the Projects master).
r.get('/projects', requirePerm('project_repository', 'view'), async (req, res) => {
  res.json({ projects: await query("SELECT id, name, client_name, status FROM project_master ORDER BY status = 'active' DESC, name") })
})

r.get('/', requirePerm('project_repository', 'view'), async (req, res) => {
  const pid = Number(req.query.project_id)
  const rows = await query(
    `SELECT pr.id, pr.project_id, pr.drive_link, pr.description, pr.created_at, pr.updated_at,
            p.name AS project_name, p.client_name, u.name AS created_by_name
       FROM project_repositories pr
       JOIN project_master p ON p.id = pr.project_id
       LEFT JOIN users u ON u.id = pr.created_by
      ${pid ? 'WHERE pr.project_id = ?' : ''}
      ORDER BY p.name, pr.created_at DESC`, pid ? [pid] : [])
  res.json({ repositories: rows })
})

r.post('/', requirePerm('project_repository', 'create'), async (req, res) => {
  const b = schema.parse(req.body)
  await assertProject(b.project_id)
  const { insertId } = await query(
    'INSERT INTO project_repositories (project_id, drive_link, description, created_by) VALUES (?, ?, ?, ?)',
    [b.project_id, b.drive_link, b.description || null, req.user.id])
  res.status(201).json({ id: insertId })
})

r.put('/:id', requirePerm('project_repository', 'edit'), async (req, res) => {
  const b = schema.parse(req.body)
  await assertProject(b.project_id)
  const { affectedRows } = await query(
    'UPDATE project_repositories SET project_id = ?, drive_link = ?, description = ? WHERE id = ?',
    [b.project_id, b.drive_link, b.description || null, req.params.id])
  if (!affectedRows) return res.status(404).json({ error: 'Link not found.' })
  res.json({ ok: true })
})

r.delete('/:id', requirePerm('project_repository', 'edit'), async (req, res) => {
  const { affectedRows } = await query('DELETE FROM project_repositories WHERE id = ?', [req.params.id])
  if (!affectedRows) return res.status(404).json({ error: 'Link not found.' })
  res.json({ ok: true })
})

export default r
