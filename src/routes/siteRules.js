// Admin: the list of unproductive / productive sites and apps the agent watches for.
import { Router } from 'express'
import { z } from 'zod'
import { query, audit } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const r = Router()
const db = { query }
r.use(requireRole('admin'))

const ROLES = ['admin', 'tl', 'developer', 'designer', 'tester']

r.get('/', async (req, res) => {
  res.json({ rules: await query('SELECT id, kind, pattern, label, rating, allow_roles AS allowRoles FROM site_rules ORDER BY rating DESC, label') })
})

r.post('/', async (req, res) => {
  const b = z.object({
    kind: z.enum(['site', 'app']),
    // site: a domain like youtube.com (no http://, no path); app: the program name like steam
    pattern: z.string().trim().toLowerCase().min(2).max(190)
      .transform(s => s.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').replace(/\.exe$/, '')),
    label: z.string().trim().min(1).max(120),
    rating: z.enum(['unproductive', 'productive']).default('unproductive'),
    allowRoles: z.array(z.enum(ROLES)).max(5).optional(),
  }).parse(req.body)
  const exists = await query('SELECT id FROM site_rules WHERE kind = ? AND pattern = ?', [b.kind, b.pattern])
  if (exists.length) return res.status(400).json({ error: 'That site or app is already in the list.' })
  const { insertId } = await query('INSERT INTO site_rules (kind, pattern, label, rating, allow_roles, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [b.kind, b.pattern, b.label, b.rating, b.allowRoles?.length ? b.allowRoles.join(',') : null, req.user.id])
  await audit(db, req, 'site_rule_added', 'site_rule', insertId, b)
  res.json({ id: insertId })
})

r.delete('/:id', async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  const [rule] = await query('SELECT * FROM site_rules WHERE id = ?', [id])
  if (!rule) return res.status(404).json({ error: 'Rule not found.' })
  await query('DELETE FROM site_rules WHERE id = ?', [id])
  await audit(db, req, 'site_rule_removed', 'site_rule', id, { pattern: rule.pattern, label: rule.label })
  res.json({ ok: true })
})

export default r
