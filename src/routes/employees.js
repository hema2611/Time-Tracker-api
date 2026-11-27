// Employee master. Basic + professional information, with a photo upload.
// One person, one record: an employee with an email and an access role also has a login (users row),
// created and kept in step here. Admin only: this holds Aadhaar and bank details and creates logins.
import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import { z } from 'zod'
import { query, transaction, audit } from '../db.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import config from '../config.js'
import { requirePerm } from '../middleware/permissions.js'

const r = Router()
r.use(requireAuth, requireRole('admin'))

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
  // Login: both or neither. Email signs in; access role decides what they can open and whether attendance is tracked.
  email: z.preprocess(v => (v === '' || v == null ? null : String(v).trim().toLowerCase()), z.string().email('Enter a valid email.').max(190).nullable()),
  access_role: z.preprocess(d, z.enum(['admin', 'tl', 'developer', 'designer', 'tester'], { message: 'Select an access role.' }).nullable()),
  // Banking information — all optional
  bank_name: text(120),
  account_no: text(34),
  ifsc: text(15),
  branch_name: text(120),
})

// access_role is written here; user_id is set by syncLogin (the employee's login) below.
const COLS = ['emp_no', 'name', 'email', 'access_role', 'date_of_birth', 'blood_group', 'phone', 'emergency_contact', 'aadhar_no', 'photo', 'role_id', 'join_date', 'last_date', 'status', 'bank_name', 'account_no', 'ifsc', 'branch_name']

// Photo upload -> returns the stored filename, which the form then saves on the employee.
r.post('/photo', requirePerm('employees', ['create', 'edit']), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received.' })
  res.status(201).json({ photo: req.file.filename })
})

r.get('/', requirePerm('employees', 'view'), async (req, res) => {
  const rows = await query(
    `SELECT e.*, r.name AS role_name, u.status AS login_status, u.last_login_at, u.must_change_password
       FROM employees e
       LEFT JOIN roles r ON r.id = e.role_id
       LEFT JOIN users u ON u.id = e.user_id
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

// Working statuses keep the login open; resigned / terminated / inactive close it.
const loginOpen = status => status === 'active' || status === 'notice_period'
const tempPassword = () => crypto.randomBytes(9).toString('base64url') // 12 characters, shown once
const fail = (status, message) => Object.assign(new Error(message), { status })

// Creates, links or updates the login that belongs to this employee.
// Returns a temporary password only when a new login was made.
async function syncLogin(db, req, empId, body) {
  if (!!body.email !== !!body.access_role) throw fail(400, 'For a login, give both an email and an access role (or neither).')
  const [emp] = await db.query('SELECT user_id FROM employees WHERE id = ?', [empId])
  if (!body.email) {
    // No login wanted: close an existing one rather than delete it (attendance history stays).
    if (emp?.user_id) await db.query("UPDATE users SET status = 'deactivated' WHERE id = ?", [emp.user_id])
    return null
  }
  if (emp?.user_id === req.user.id && (body.access_role !== 'admin' || !loginOpen(body.status)))
    throw fail(400, 'You cannot remove your own admin access.')
  const status = loginOpen(body.status) ? 'active' : 'deactivated'
  let userId = emp?.user_id
  if (!userId) {
    // An existing login with this email is linked instead of making a second one.
    const [existing] = await db.query('SELECT id, role FROM users WHERE email = ?', [body.email])
    if (existing?.role === 'client') throw fail(409, 'This email belongs to a client login.')
    if (existing) {
      const [taken] = await db.query('SELECT id FROM employees WHERE user_id = ? AND id <> ?', [existing.id, empId])
      if (taken) throw fail(409, 'This email is already linked to another employee.')
      userId = existing.id
    }
  }
  if (userId) {
    await db.query('UPDATE users SET name = ?, email = ?, role = ?, status = ? WHERE id = ?', [body.name, body.email, body.access_role, status, userId])
    await db.query('UPDATE employees SET user_id = ? WHERE id = ?', [userId, empId])
    await audit(db, req, 'login_updated', 'user', userId, { employee: empId, role: body.access_role, status })
    return null
  }
  const pass = tempPassword()
  const { insertId } = await db.query(
    'INSERT INTO users (name, email, password_hash, role, status, must_change_password, created_by) VALUES (?, ?, ?, ?, ?, 1, ?)',
    [body.name, body.email, await bcrypt.hash(pass, 12), body.access_role, status, req.user.id])
  await db.query('UPDATE employees SET user_id = ? WHERE id = ?', [insertId, empId])
  await audit(db, req, 'login_created', 'user', insertId, { employee: empId, role: body.access_role })
  return pass
}

const dupMessage = e => e.code !== 'ER_DUP_ENTRY' ? null
  : /email/.test(e.sqlMessage || '') ? 'Another employee already uses this email.' : 'An employee with this number already exists.'

r.post('/', requirePerm('employees', 'create'), async (req, res) => {
  const body = empSchema.parse(req.body)
  try {
    const out = await transaction(async db => {
      const { insertId } = await db.query(
        `INSERT INTO employees (${COLS.join(', ')}) VALUES (${COLS.map(() => '?').join(', ')})`,
        COLS.map(c => body[c] ?? null),
      )
      return { id: insertId, tempPassword: await syncLogin(db, req, insertId, body) }
    })
    res.status(201).json(out)
  } catch (e) {
    const m = dupMessage(e)
    if (m) return res.status(409).json({ error: m })
    throw e
  }
})

r.put('/:id', requirePerm('employees', 'edit'), async (req, res) => {
  const body = empSchema.parse(req.body)
  try {
    const out = await transaction(async db => {
      const { affectedRows } = await db.query(
        `UPDATE employees SET ${COLS.map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...COLS.map(c => body[c] ?? null), req.params.id],
      )
      if (!affectedRows) throw fail(404, 'Employee not found.')
      return { ok: true, tempPassword: await syncLogin(db, req, +req.params.id, body) }
    })
    res.json(out)
  } catch (e) {
    const m = dupMessage(e)
    if (m) return res.status(409).json({ error: m })
    throw e
  }
})

// New temporary password for the employee's login; they must change it at the next sign-in.
r.post('/:id/reset-password', requirePerm('employees', 'edit'), async (req, res) => {
  const [emp] = await query('SELECT user_id FROM employees WHERE id = ?', [req.params.id])
  if (!emp?.user_id) return res.status(400).json({ error: 'This employee has no login yet. Add an email and access role first.' })
  const pass = tempPassword()
  await query('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [await bcrypt.hash(pass, 12), emp.user_id])
  await audit({ query }, req, 'password_reset', 'user', emp.user_id, { employee: +req.params.id })
  res.json({ tempPassword: pass })
})

// Deleting an employee closes their login (kept for attendance history), then removes the record.
r.delete('/:id', requirePerm('employees', 'edit'), async (req, res) => {
  const [emp] = await query('SELECT user_id FROM employees WHERE id = ?', [req.params.id])
  if (!emp) return res.status(404).json({ error: 'Employee not found.' })
  if (emp.user_id && emp.user_id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own employee record.' })
  await transaction(async db => {
    if (emp.user_id) await db.query("UPDATE users SET status = 'deactivated' WHERE id = ?", [emp.user_id])
    await db.query('DELETE FROM employees WHERE id = ?', [req.params.id])
  })
  res.json({ ok: true })
})

export default r
