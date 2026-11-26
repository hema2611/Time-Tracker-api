// Project master. Simple CRUD, same shape as the role master.
import { Router } from 'express'
import { z } from 'zod'
import { query } from '../db.js'
import { requirePerm } from '../middleware/permissions.js'

const r = Router()

const schema = z.object({
  name: z.string().trim().min(1, 'Project name is required.').max(160),
  client_name: z.string().trim().min(1, 'Client name is required.').max(160),
  address: z.string().trim().min(1, 'Address is required.').max(255),
  contact_person: z.string().trim().min(1, 'Contact person is required.').max(160),
  status: z.enum(['active', 'inactive']).default('active'),
})
const COLS = ['name', 'client_name', 'address', 'contact_person', 'status']

r.get('/', requirePerm('projects', 'view'), async (req, res) => {
  const activeOnly = req.query.status === 'active'
  const rows = await query(
    `SELECT id, name, client_name, address, contact_person, status, created_at, updated_at
       FROM project_master ${activeOnly ? "WHERE status = 'active'" : ''} ORDER BY name`,
  )
  res.json({ projects: rows })
})

r.post('/', requirePerm('projects', 'create'), async (req, res) => {
  const body = schema.parse(req.body)
  const { insertId } = await query(
    `INSERT INTO project_master (${COLS.join(', ')}) VALUES (${COLS.map(() => '?').join(', ')})`,
    COLS.map(c => body[c]),
  )
  res.status(201).json({ id: insertId })
})

r.put('/:id', requirePerm('projects', 'edit'), async (req, res) => {
  const body = schema.parse(req.body)
  const { affectedRows } = await query(
    `UPDATE project_master SET ${COLS.map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...COLS.map(c => body[c]), req.params.id],
  )
  if (!affectedRows) return res.status(404).json({ error: 'Project not found.' })
  res.json({ ok: true })
})

r.delete('/:id', requirePerm('projects', 'edit'), async (req, res) => {
  const { affectedRows } = await query('DELETE FROM project_master WHERE id = ?', [req.params.id])
  if (!affectedRows) return res.status(404).json({ error: 'Project not found.' })
  res.json({ ok: true })
})

export default r
