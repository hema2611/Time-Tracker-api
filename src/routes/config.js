// Config / lookup options for dropdowns (e.g. event types).
import { Router } from 'express'
import { query } from '../db.js'

const r = Router()

// GET /api/config?category=event_type  -> active options for that category
r.get('/', async (req, res) => {
  const { category } = req.query
  const rows = await query(
    `SELECT id, category, label, sort_order, is_active
       FROM config_options
      ${category ? 'WHERE category = ? AND is_active = 1' : ''}
      ORDER BY sort_order, label`,
    category ? [category] : [],
  )
  res.json({ options: rows })
})

export default r
