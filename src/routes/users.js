import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { query, transaction, audit } from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { passwordRule } from './auth.js'

const r = Router()
const ROLES = ['admin', 'tl', 'developer', 'designer', 'tester', 'client']
export const emailRule = z.string().trim().toLowerCase().regex(/^\S+@\S+\.\S+$/, 'Enter a valid email.').max(190)

r.use(requireRole('admin'))

r.get('/', async (req, res) => {
  const rows = await query(`
    SELECT u.id, u.name, u.email, u.role, u.client_access AS clientAccess, u.status, u.last_login_at AS lastLoginAt,
           (SELECT GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR '||')
              FROM projects p LEFT JOIN project_members m ON m.project_id = p.id
             WHERE p.tl_id = u.id OR m.user_id = u.id) AS projects
      FROM users u ORDER BY u.status = 'deactivated', u.name`)
  res.json({ users: rows.map(u => ({ ...u, projects: u.projects ? u.projects.split('||') : [] })) })
})

// The admin gives a temporary password; the user must change it at first sign-in.
r.post('/', async (req, res) => {
  const b = z.object({
    name: z.string().trim().min(1, 'Name is required.').max(120),
    email: emailRule,
    role: z.enum(ROLES),
    clientAccess: z.enum(['approver', 'viewer']).optional(),
    password: passwordRule,
    projectId: z.number().int().positive().optional(),
  }).parse(req.body)
  if ((await query('SELECT id FROM users WHERE email = ?', [b.email])).length) return res.status(409).json({ error: 'A user with this email already exists.' })

  const id = await transaction(async db => {
    const out = await db.query(
      "INSERT INTO users (name, email, password_hash, role, client_access, status, must_change_password, created_by) VALUES (?, ?, ?, ?, ?, 'active', 1, ?)",
      [b.name, b.email, await bcrypt.hash(b.password, 12), b.role, b.role === 'client' ? (b.clientAccess || 'viewer') : null, req.user.id])
    if (b.projectId) await db.query('INSERT IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)', [b.projectId, out.insertId])
    await audit(db, req, 'user_created', 'user', out.insertId, { email: b.email, role: b.role })
    return out.insertId
  })
  res.status(201).json({ id })
})

r.patch('/:id', async (req, res) => {
  const id = +req.params.id
  const b = z.object({ status: z.enum(['active', 'deactivated']).optional(), password: passwordRule.optional() }).parse(req.body)
  const [user] = await query('SELECT * FROM users WHERE id = ?', [id])
  if (!user) return res.status(404).json({ error: 'User not found.' })

  if (b.status === 'deactivated') {
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot deactivate yourself.' })
    if (user.role === 'admin') {
      const [{ n }] = await query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active' AND id <> ?", [id])
      if (!n) return res.status(400).json({ error: 'At least one active admin is needed.' })
    }
  }
  if (b.status === 'active' && !user.password_hash && !b.password) return res.status(400).json({ error: 'Set a temporary password to activate this user.' })

  await transaction(async db => {
    if (b.password) await db.query('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [await bcrypt.hash(b.password, 12), id])
    if (b.status) await db.query('UPDATE users SET status = ? WHERE id = ?', [b.status, id])
    await audit(db, req, b.status ? `user_${b.status}` : 'user_password_reset', 'user', id)
  })
  res.json({ ok: true })
})

export default r
