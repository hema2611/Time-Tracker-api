// Events with multi-select attendees.
import { Router } from 'express'
import { z } from 'zod'
import { query, transaction } from '../db.js'

const r = Router()

const d = v => (v === '' || v == null ? null : v)
const timeStr = z.preprocess(d, z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Pick a time.').nullable())

const schema = z.object({
  title: z.string().trim().min(1, 'Event title is required.').max(160),
  event_type_id: z.preprocess(v => (v === '' || v == null ? null : Number(v)), z.number({ message: 'Select an event type.' }).int().positive()),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.'),
  start_time: timeStr,
  end_time: timeStr,
  location: z.preprocess(d, z.string().trim().max(160).nullable()),
  description: z.preprocess(d, z.string().trim().max(2000).nullable()),
  status: z.enum(['upcoming', 'ongoing', 'completed']).default('upcoming'),
  employee_ids: z.array(z.coerce.number().int().positive()).default([]),
}).refine(v => !v.start_time || !v.end_time || v.end_time > v.start_time, { message: 'End time must be after start time.', path: ['end_time'] })

const normTime = t => (t ? t.slice(0, 5) : null)

r.get('/', async (req, res) => {
  const rows = await query(
    `SELECT e.id, e.title, e.event_type_id, c.label AS event_type, e.event_date,
            e.start_time, e.end_time, e.location, e.description, e.status,
            GROUP_CONCAT(ea.employee_id) AS emp_ids
       FROM events e
       LEFT JOIN config_options c ON c.id = e.event_type_id
       LEFT JOIN event_attendees ea ON ea.event_id = e.id
      GROUP BY e.id
      ORDER BY e.event_date DESC, e.start_time`,
  )
  const events = rows.map(r => ({
    ...r,
    start_time: normTime(r.start_time),
    end_time: normTime(r.end_time),
    employee_ids: r.emp_ids ? r.emp_ids.split(',').map(Number) : [],
  }))
  res.json({ events })
})

async function saveAttendees(db, eventId, ids) {
  await db.query('DELETE FROM event_attendees WHERE event_id = ?', [eventId])
  const unique = [...new Set(ids)]
  for (const empId of unique) {
    await db.query('INSERT INTO event_attendees (event_id, employee_id) VALUES (?, ?)', [eventId, empId])
  }
}

r.post('/', async (req, res) => {
  const b = schema.parse(req.body)
  const id = await transaction(async db => {
    const { insertId } = await db.query(
      `INSERT INTO events (title, event_type_id, event_date, start_time, end_time, location, description, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.title, b.event_type_id, b.event_date, b.start_time, b.end_time, b.location, b.description, b.status],
    )
    await saveAttendees(db, insertId, b.employee_ids)
    return insertId
  })
  res.status(201).json({ id })
})

r.put('/:id', async (req, res) => {
  const b = schema.parse(req.body)
  const ok = await transaction(async db => {
    const { affectedRows } = await db.query(
      `UPDATE events SET title = ?, event_type_id = ?, event_date = ?, start_time = ?, end_time = ?, location = ?, description = ?, status = ? WHERE id = ?`,
      [b.title, b.event_type_id, b.event_date, b.start_time, b.end_time, b.location, b.description, b.status, req.params.id],
    )
    if (!affectedRows) return false
    await saveAttendees(db, req.params.id, b.employee_ids)
    return true
  })
  if (!ok) return res.status(404).json({ error: 'Event not found.' })
  res.json({ ok: true })
})

r.delete('/:id', async (req, res) => {
  const { affectedRows } = await query('DELETE FROM events WHERE id = ?', [req.params.id])
  if (!affectedRows) return res.status(404).json({ error: 'Event not found.' })
  res.json({ ok: true })
})

export default r
