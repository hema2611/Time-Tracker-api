// Employee master. Basic + professional information, with a photo upload.
import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import multer from 'multer'
import { z } from 'zod'
import { query } from '../db.js'
import config from '../config.js'

const r = Router()

fs.mkdirSync(config.uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: config.uploadDir,
  filename: (req, file, cb) => cb(null, `emp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
})
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) =>
    /^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype) ? cb(null, true) : cb(Object.assign(new Error('Please upload an image (PNG, JPG, WEBP or GIF).'), { status: 400 })),
})

const d = v => (v === '' || v == null ? null : v)
const dateStr = z.preprocess(d, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.').nullable()) // optional date
const reqDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'This date is required.')
const text = max => z.preprocess(d, z.string().trim().max(max).nullable())

const empSchema = z.object({
  emp_no: z.string().trim().min(1, 'Employee number is required.').max(40),
  name: z.string().trim().min(1, 'Full name is required.').max(160),
  // Basic information — all required
  date_of_birth: reqDate,
  blood_group: z.enum(['A1+ve', 'A1-ve', 'A2+ve', 'A2-ve', 'B+ve', 'B-ve', 'A1B+ve', 'A1B-ve', 'A2B+ve', 'A2B-ve', 'AB+ve', 'AB-ve', 'O+ve', 'O-ve', 'Bombay'], { message: 'Select a blood group.' }),
  phone: z.string().regex(/^\d{10}$/, 'Enter a 10-digit mobile number.'),
  emergency_contact: z.string().regex(/^\d{10}$/, 'Enter a 10-digit mobile number.'),
  aadhar_no: z.string().regex(/^\d{12}$/, 'Enter a 12-digit Aadhaar number.'),
  photo: z.string().min(1, 'A photo is required.').max(255),
  // Professional information
  role_id: z.preprocess(v => (v === '' || v == null ? null : Number(v)), z.number({ message: 'Select a role.' }).int().positive()),
  join_date: reqDate,
  last_date: dateStr, // optional
  status: z.enum(['active', 'inactive', 'notice_period', 'resigned', 'terminated']).default('active'),
  // Banking information — all optional
  bank_name: text(120),
  account_no: text(34),
  ifsc: text(15),
  branch_name: text(120),
})

const COLS = ['emp_no', 'name', 'date_of_birth', 'blood_group', 'phone', 'emergency_contact', 'aadhar_no', 'photo', 'role_id', 'join_date', 'last_date', 'status', 'bank_name', 'account_no', 'ifsc', 'branch_name']

// Photo upload -> returns the stored filename, which the form then saves on the employee.
r.post('/photo', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received.' })
  res.status(201).json({ photo: req.file.filename })
})

r.get('/', async (req, res) => {
  const rows = await query(
    `SELECT e.*, r.name AS role_name
       FROM employees e
       LEFT JOIN roles r ON r.id = e.role_id
      ORDER BY e.created_at DESC`,
  )
  res.json({ employees: rows })
})

r.get('/:id', async (req, res) => {
  const [row] = await query(
    `SELECT e.*, r.name AS role_name FROM employees e LEFT JOIN roles r ON r.id = e.role_id WHERE e.id = ?`,
    [req.params.id],
  )
  if (!row) return res.status(404).json({ error: 'Employee not found.' })
  res.json({ employee: row })
})

r.post('/', async (req, res) => {
  const body = empSchema.parse(req.body)
  try {
    const { insertId } = await query(
      `INSERT INTO employees (${COLS.join(', ')}) VALUES (${COLS.map(() => '?').join(', ')})`,
      COLS.map(c => body[c]),
    )
    res.status(201).json({ id: insertId })
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An employee with this number already exists.' })
    throw e
  }
})

r.put('/:id', async (req, res) => {
  const body = empSchema.parse(req.body)
  try {
    const { affectedRows } = await query(
      `UPDATE employees SET ${COLS.map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...COLS.map(c => body[c]), req.params.id],
    )
    if (!affectedRows) return res.status(404).json({ error: 'Employee not found.' })
    res.json({ ok: true })
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An employee with this number already exists.' })
    throw e
  }
})

r.delete('/:id', async (req, res) => {
  const { affectedRows } = await query('DELETE FROM employees WHERE id = ?', [req.params.id])
  if (!affectedRows) return res.status(404).json({ error: 'Employee not found.' })
  res.json({ ok: true })
})

export default r
