// Role permissions: list modules, read the signed-in user's permissions, read/save a role's matrix.
import { Router } from 'express'
import { z } from 'zod'
import { query, transaction } from '../db.js'
import { MODULES, MODULE_KEYS, permissionsFor, requirePerm, requireAdmin } from '../middleware/permissions.js'

const r = Router()

r.get('/modules', (req, res) => res.json({ modules: MODULES }))

// What the signed-in user may do; the web app builds its menu from this.
r.get('/me', async (req, res) => res.json(await permissionsFor(req.user)))

r.get('/roles/:id', requirePerm('roles', 'view'), async (req, res) => {
  const [role] = await query('SELECT id, name, status FROM roles WHERE id = ?', [req.params.id])
  if (!role) return res.status(404).json({ error: 'Role not found.' })
  const rows = await query('SELECT module_key, can_view, can_create, can_edit FROM role_permissions WHERE role_id = ?', [role.id])
  const permissions = Object.fromEntries(MODULE_KEYS.map(k => [k, { view: false, create: false, edit: false }]))
  for (const p of rows) {
    if (permissions[p.module_key]) permissions[p.module_key] = { view: !!p.can_view, create: !!p.can_create, edit: !!p.can_edit }
  }
  res.json({ role, modules: MODULES, permissions, canManage: req.user.role === 'admin' })
})

const flags = z.object({ view: z.boolean().default(false), create: z.boolean().default(false), edit: z.boolean().default(false) })
const body = z.object({ permissions: z.record(z.string(), flags) })

r.put('/roles/:id', requireAdmin, async (req, res) => {
  const { permissions } = body.parse(req.body)
  const unknown = Object.keys(permissions).filter(k => !MODULE_KEYS.includes(k))
  if (unknown.length) return res.status(400).json({ error: `Unknown module: ${unknown.join(', ')}` })
  const [role] = await query('SELECT id FROM roles WHERE id = ?', [req.params.id])
  if (!role) return res.status(404).json({ error: 'Role not found.' })

  await transaction(async db => {
    await db.query('DELETE FROM role_permissions WHERE role_id = ?', [role.id])
    for (const [key, p] of Object.entries(permissions)) {
      if (!p.view && !p.create && !p.edit) continue
      // Create or edit without view makes no sense; store view as well.
      await db.query('INSERT INTO role_permissions (role_id, module_key, can_view, can_create, can_edit) VALUES (?, ?, ?, ?, ?)',
        [role.id, key, 1, p.create ? 1 : 0, p.edit ? 1 : 0])
    }
  })
  res.json({ ok: true })
})

export default r
