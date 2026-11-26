// Holiday calendar master.
import { Router } from 'express'
import { z } from 'zod'
import { query } from '../db.js'

const r = Router()

const schema = z.object({
  holiday_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.'),
  name: z.string().trim().min(1, 'Holiday name is required.').max(160),
  status: z.enum(['active', 'inactive']).default('active'),
})

// GET /api/holidays?year=2026
r.get('/', async (req, res) => {
  const { year } = req.query
  const rows = await query(
    `SELECT id, holiday_date, name, status FROM holidays
      ${year ? 'WHERE YEAR(holiday_date) = ?' : ''} ORDER BY holiday_date`,
    year ? [year] : [],
  )
  res.json({ holidays: rows })
})

r.post('/', async (req, res) => {
  const b = schema.parse(req.body)
  const { insertId } = await query('INSERT INTO holidays (holiday_date, name, status) VALUES (?, ?, ?)', [b.holiday_date, b.name, b.status])
  res.status(201).json({ id: insertId })
})

r.put('/:id', async (req, res) => {
  const b = schema.parse(req.body)
  const { affectedRows } = await query('UPDATE holidays SET holiday_date = ?, name = ?, status = ? WHERE id = ?', [b.holiday_date, b.name, b.status, req.params.id])
  if (!affectedRows) return res.status(404).json({ error: 'Holiday not found.' })
  res.json({ ok: true })
})

r.delete('/:id', async (req, res) => {
  const { affectedRows } = await query('DELETE FROM holidays WHERE id = ?', [req.params.id])
  if (!affectedRows) return res.status(404).json({ error: 'Holiday not found.' })
  res.json({ ok: true })
})

export default r
