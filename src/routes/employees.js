// Employee master. Basic + professional information, with a photo upload.
import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import multer from 'multer'
import { z } from 'zod'
import { query } from '../db.js'
import config from '../config.js'
import { requirePerm } from '../middleware/permissions.js'

const r = Router()

// Slim, non-sensitive list for any signed-in user: the holiday calendar (birthdays, anniversaries)
// and the event participant picker need it even without access to the Employee master.
// Birthday is day + month only (no year, so no age); no phone, Aadhaar, bank or email.
r.get('/directory', async (req, res) => {
  const rows = await query(
    `SELECT e.id, e.emp_no, e.name, e.photo, e.status, e.join_date, r.name AS role_name,
            DATE_FORMAT(e.date_of_birth, '%m-%d') AS birthday
       FROM employees e
       LEFT JOIN roles r ON r.id = e.role_id
      ORDER BY e.name`,
  )
  res.json({ employees: rows })
})

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
  email: z.string({ message: 'Email is required.' }).trim().toLowerCase().min(1, 'Email is required.').max(190).email('Enter a valid email address.'),
  // Basic information — all required
  date_of_birth: reqDate,
  blood_group: z.enum(['A+', 'A-', 'A1+', 'A1-', 'A2+', 'A2-', 'B+', 'B-', 'AB+', 'AB-', 'A1B+', 'A1B-', 'A2B+', 'A2B-', 'O+', 'O-'], { message: 'Select a blood group.' }),
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

// access_role / user_id are owned by the employee-login work and are deliberately not written here.
const COLS = ['emp_no', 'name', 'email', 'date_of_birth', 'blood_group', 'phone', 'emergency_contact', 'aadhar_no', 'photo', 'role_id', 'join_date', 'last_date', 'status', 'bank_name', 'account_no', 'ifsc', 'branch_name']

// A duplicate can be the employee number or the email; say which.
const dupMessage = e => (/email/i.test(e.sqlMessage || '')
  ? 'Another employee already uses this email.'
  : 'An employee with this number already exists.')

// Photo upload -> returns the stored filename, which the form then saves on the employee.
r.post('/photo', requirePerm('employees', ['create', 'edit']), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received.' })
  res.status(201).json({ photo: req.file.filename })
})

r.get('/', requirePerm('employees', 'view'), async (req, res) => {
  const rows = await query(
    `SELECT e.*, r.name AS role_name
       FROM employees e
       LEFT JOIN roles r ON r.id = e.role_id
      ORDER BY e.created_at DESC`,
  )
  res.json({ employees: rows })
})

r.get('/:id', requirePerm('employees', 'view'), async (req, res) => {
  const [row] = await query(
    `SELECT e.*, r.name AS role_name FROM employees e LEFT JOIN roles r ON r.id = e.role_id WHERE e.id = ?`,
    [req.params.id],
  )
  if (!row) return res.status(404).json({ error: 'Employee not found.' })
  res.json({ employee: row })
})

r.post('/', requirePerm('employees', 'create'), async (req, res) => {
  const body = empSchema.parse(req.body)
  try {
    const { insertId } = await query(
      `INSERT INTO employees (${COLS.join(', ')}) VALUES (${COLS.map(() => '?').join(', ')})`,
      COLS.map(c => body[c]),
    )
    res.status(201).json({ id: insertId })
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: dupMessage(e) })
    throw e
  }
})

r.put('/:id', requirePerm('employees', 'edit'), async (req, res) => {
  const body = empSchema.parse(req.body)
  try {
    const { affectedRows } = await query(
      `UPDATE employees SET ${COLS.map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...COLS.map(c => body[c]), req.params.id],
    )
    if (!affectedRows) return res.status(404).json({ error: 'Employee not found.' })
    res.json({ ok: true })
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: dupMessage(e) })
    throw e
  }
})

r.delete('/:id', requirePerm('employees', 'edit'), async (req, res) => {
  const { affectedRows } = await query('DELETE FROM employees WHERE id = ?', [req.params.id])
  if (!affectedRows) return res.status(404).json({ error: 'Employee not found.' })
  res.json({ ok: true })
})

export default r
