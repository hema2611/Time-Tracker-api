// Role master. Simple CRUD. The employee form reads only active roles.
import { Router } from 'express'
import { z } from 'zod'
import { query } from '../db.js'
import { requirePerm, DEFAULT_VIEW, DEFAULT_CREATE } from '../middleware/permissions.js'

const r = Router()
const canView = requirePerm('roles', 'view')

const roleSchema = z.object({
  name: z.string().trim().min(1, 'Role name is required.').max(120),
  status: z.enum(['active', 'inactive']).default('active'),
})

// GET /api/roles               -> every role (role master list; needs Roles view)
// GET /api/roles?status=active -> only active role names (dropdowns; any signed-in user)
r.get('/', (req, res, next) => (req.query.status === 'active' ? next() : canView(req, res, next)), async (req, res) => {
  const activeOnly = req.query.status === 'active'
  const rows = await query(
    `SELECT id, name, status, created_at, updated_at FROM roles ${activeOnly ? "WHERE status = 'active'" : ''} ORDER BY name`,
  )
  res.json({ roles: rows })
})

r.post('/', requirePerm('roles', 'create'), async (req, res) => {
  const body = roleSchema.parse(req.body)
  try {
    const { insertId } = await query('INSERT INTO roles (name, status) VALUES (?, ?)', [body.name, body.status])
    // Same starting point as existing roles: view the shared screens.
    for (const key of DEFAULT_VIEW) {
      await query('INSERT IGNORE INTO role_permissions (role_id, module_key, can_view, can_create) VALUES (?, ?, 1, ?)',
        [insertId, key, DEFAULT_CREATE.includes(key) ? 1 : 0])
    }
    res.status(201).json({ id: insertId })
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A role with this name already exists.' })
    throw e
  }
})

r.put('/:id', requirePerm('roles', 'edit'), async (req, res) => {
  const body = roleSchema.parse(req.body)
  try {
    const { affectedRows } = await query('UPDATE roles SET name = ?, status = ? WHERE id = ?', [body.name, body.status, req.params.id])
    if (!affectedRows) return res.status(404).json({ error: 'Role not found.' })
    res.json({ ok: true })
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A role with this name already exists.' })
    throw e
  }
})

r.delete('/:id', requirePerm('roles', 'edit'), async (req, res) => {
  try {
    const { affectedRows } = await query('DELETE FROM roles WHERE id = ?', [req.params.id])
    if (!affectedRows) return res.status(404).json({ error: 'Role not found.' })
    res.json({ ok: true })
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: 'This role is assigned to employees. Set it inactive instead.' })
    throw e
  }
})

export default r
