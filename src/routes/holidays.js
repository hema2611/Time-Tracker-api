// Holiday calendar master.
import { Router } from 'express'
import { z } from 'zod'
import { assertNotPast } from '../officeTime.js'
import { query } from '../db.js'

const r = Router()

const schema = z.object({
  holiday_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.'),
  name: z.string().trim().min(1, 'Holiday name is required.').max(160),
  status: z.enum(['active', 'inactive']).default('active'),
  // bundled icon name, a pasted emoji, or an https image link; empty = automatic
  icon: z.preprocess(v => (v === '' || v == null ? null : v), z.string().trim().max(500)
    .refine(v => !/^[a-z][a-z0-9+.-]*:/i.test(v) || /^https:\/\//i.test(v), 'An image link must start with https://').nullable()).default(null),
})

// GET /api/holidays?year=2026
r.get('/', async (req, res) => {
  const { year } = req.query
  const rows = await query(
    `SELECT id, holiday_date, name, icon, status FROM holidays
      ${year ? 'WHERE YEAR(holiday_date) = ?' : ''} ORDER BY holiday_date`,
    year ? [year] : [],
  )
  res.json({ holidays: rows })
})

// Past holidays are read-only.
async function assertEditable(id) {
  const [x] = await query('SELECT holiday_date FROM holidays WHERE id = ?', [id])
  if (x) assertNotPast(x.holiday_date, 'Holidays')
}

r.post('/', async (req, res) => {
  const b = schema.parse(req.body)
  assertNotPast(b.holiday_date, 'Holidays')
  const { insertId } = await query('INSERT INTO holidays (holiday_date, name, icon, status) VALUES (?, ?, ?, ?)', [b.holiday_date, b.name, b.icon, b.status])
  res.status(201).json({ id: insertId })
})

r.put('/:id', async (req, res) => {
  const b = schema.parse(req.body)
  await assertEditable(req.params.id)
  assertNotPast(b.holiday_date, 'Holidays')
  const { affectedRows } = await query('UPDATE holidays SET holiday_date = ?, name = ?, icon = ?, status = ? WHERE id = ?', [b.holiday_date, b.name, b.icon, b.status, req.params.id])
  if (!affectedRows) return res.status(404).json({ error: 'Holiday not found.' })
  res.json({ ok: true })
})

r.delete('/:id', async (req, res) => {
  await assertEditable(req.params.id)
  const { affectedRows } = await query('DELETE FROM holidays WHERE id = ?', [req.params.id])
  if (!affectedRows) return res.status(404).json({ error: 'Holiday not found.' })
  res.json({ ok: true })
})

export default r
