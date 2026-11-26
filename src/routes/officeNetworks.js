// Admin: how the tracker recognises "Office" at check-in / check-out (office internet address or Wi-Fi name).
import { Router } from 'express'
import { z } from 'zod'
import { query, audit } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const r = Router()
const db = { query }
r.use(requireRole('admin'))

r.get('/', async (req, res) => {
  res.json({ networks: await query('SELECT id, kind, value, label FROM office_networks ORDER BY label, kind') })
})

r.post('/', async (req, res) => {
  const b = z.object({
    kind: z.enum(['ip', 'wifi']),
    value: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(120),
  }).parse(req.body)
  if (b.kind === 'ip' && !/^[0-9a-f.:]+$/i.test(b.value)) return res.status(400).json({ error: 'Enter an internet address like 203.0.113.10.' })
  if ((await query('SELECT id FROM office_networks WHERE kind = ? AND value = ?', [b.kind, b.value])).length) {
    return res.status(400).json({ error: 'That network is already in the list.' })
  }
  const { insertId } = await query('INSERT INTO office_networks (kind, value, label, created_by) VALUES (?, ?, ?, ?)', [b.kind, b.value, b.label, req.user.id])
  await audit(db, req, 'office_network_added', 'office_network', insertId, b)
  res.json({ id: insertId })
})

r.delete('/:id', async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id)
  await query('DELETE FROM office_networks WHERE id = ?', [id])
  await audit(db, req, 'office_network_removed', 'office_network', id)
  res.json({ ok: true })
})

export default r
