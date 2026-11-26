// Reimbursement claims with bills attached.
//   view   = see your own claims
//   create = submit a claim
//   edit   = see everyone's claims and set the payment status: unpaid (default) / pending / hold / paid
import { Router } from 'express'
import { z } from 'zod'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { query, transaction } from '../db.js'
import { requirePerm } from '../middleware/permissions.js'
import config from '../config.js'

const r = Router()

// Bills are private: kept outside the public uploads folder and served only through this route.
const DIR = path.resolve(config.uploadDir, '..', 'private_uploads', 'reimbursements')
fs.mkdirSync(DIR, { recursive: true })

const MAX_FILES = 10
const MAX_MB = 10
const ALLOWED = /^(image\/(png|jpe?g|webp|gif|heic|heif)|application\/pdf)$/

const upload = multer({
  storage: multer.diskStorage({
    destination: DIR,
    filename: (req, file, cb) => cb(null, `rb_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase().slice(0, 10)}`),
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: MAX_FILES },
  fileFilter: (req, file, cb) => ALLOWED.test(file.mimetype)
    ? cb(null, true)
    : cb(Object.assign(new Error(`“${file.originalname}” is not an image or PDF.`), { status: 400 })),
})

// Turns multer's errors into friendly messages.
const receive = (req, res, next) => upload.array('files', MAX_FILES)(req, res, err => {
  if (!err) return next()
  const msg = err.code === 'LIMIT_FILE_SIZE' ? `Each file must be ${MAX_MB} MB or smaller.`
    : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? `You can attach up to ${MAX_FILES} files.`
    : err.message
  next(Object.assign(new Error(msg), { status: 400 }))
})
const removeUploaded = files => (files || []).forEach(f => fs.rm(f.path, { force: true }, () => {}))

const claim = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(160),
  description: z.string().trim().max(2000).optional().transform(v => v || null),
  amount: z.string({ required_error: 'Enter the amount.' }).trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter the amount as a number, with at most 2 decimal places.')
    .transform(Number)
    .refine(v => v > 0, 'Amount must be more than 0.')
    .refine(v => v <= 10000000, 'That amount looks too large.'),
})

const STATUSES = ['unpaid', 'pending', 'hold', 'paid', 'cancelled']
const isEditor = req => !!req.perms?.modules?.reimbursements?.edit

// List. scope=mine (default) or scope=team (needs edit).
r.get('/', async (req, res, next) => requirePerm('reimbursements', req.query.scope === 'team' ? 'edit' : 'view')(req, res, next), async (req, res) => {
  const team = req.query.scope === 'team'
  const where = ['1=1'], params = []
  if (!team) { where.push('x.user_id = ?'); params.push(req.user.id) }
  if (STATUSES.includes(req.query.status)) { where.push('x.status = ?'); params.push(req.query.status) }
  const year = Number(req.query.year)
  if (year) { where.push('YEAR(x.created_at) = ?'); params.push(year) }

  const rows = await query(
    `SELECT x.*, u.name AS user_name, u.email AS user_email, e.photo, e.emp_no, d.name AS decided_by_name
       FROM reimbursements x
       JOIN users u ON u.id = x.user_id
       LEFT JOIN employees e ON e.user_id = x.user_id
       LEFT JOIN users d ON d.id = x.decided_by
      WHERE ${where.join(' AND ')}
      ORDER BY x.created_at DESC, x.id DESC`, params)
  const files = rows.length
    ? await query(`SELECT id, reimbursement_id, original_name, mime_type, size_bytes FROM reimbursement_files WHERE reimbursement_id IN (${rows.map(() => '?').join(',')}) ORDER BY id`, rows.map(x => x.id))
    : []
  const byClaim = new Map()
  for (const f of files) byClaim.set(f.reimbursement_id, [...(byClaim.get(f.reimbursement_id) || []), f])
  res.json({
    claims: rows.map(x => ({ ...x, amount: Number(x.amount), files: byClaim.get(x.id) || [], mine: x.user_id === req.user.id })),
  })
})

// Totals for the signed-in user's own claims.
r.get('/summary', requirePerm('reimbursements', 'view'), async (req, res) => {
  const rows = await query('SELECT status, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM reimbursements WHERE user_id = ? GROUP BY status', [req.user.id])
  const out = Object.fromEntries(STATUSES.map(k => [k, { n: 0, total: 0 }]))
  for (const x of rows) out[x.status] = { n: Number(x.n), total: Number(x.total) }
  res.json(out)
})

// Submit a claim (multipart: title, description, amount, files[]). At least one bill is required.
r.post('/', requirePerm('reimbursements', 'create'), receive, async (req, res) => {
  try {
    const b = claim.parse(req.body)
    if (!req.files?.length) throw Object.assign(new Error('Attach at least one bill (image or PDF).'), { status: 400 })
    const id = await transaction(async tx => {
      const { insertId } = await tx.query('INSERT INTO reimbursements (user_id, title, description, amount) VALUES (?, ?, ?, ?)',
        [req.user.id, b.title, b.description, b.amount])
      for (const f of req.files) {
        await tx.query('INSERT INTO reimbursement_files (reimbursement_id, stored_name, original_name, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?)',
          [insertId, f.filename, f.originalname.slice(0, 255), f.mimetype, f.size])
      }
      return insertId
    })
    res.status(201).json({ id })
  } catch (e) { removeUploaded(req.files); throw e }
})

// Open / download a bill. Only the claimant or someone with edit access.
r.get('/files/:fileId', requirePerm('reimbursements', 'view'), async (req, res) => {
  const [f] = await query(
    `SELECT f.*, x.user_id FROM reimbursement_files f JOIN reimbursements x ON x.id = f.reimbursement_id WHERE f.id = ?`, [req.params.fileId])
  if (!f || (f.user_id !== req.user.id && !isEditor(req))) return res.status(404).json({ error: 'File not found.' })
  const file = path.join(DIR, path.basename(f.stored_name))
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'File not found.' })
  res.setHeader('Content-Type', f.mime_type)
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.original_name)}`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.sendFile(file)
})

// Cancel: the claimant while unpaid; an editor for any claim not yet paid.
r.post('/:id/cancel', requirePerm('reimbursements', 'view'), async (req, res) => {
  const note = z.object({ note: z.string().trim().max(255).optional() }).parse(req.body || {}).note || null
  const [x] = await query('SELECT id, user_id, status FROM reimbursements WHERE id = ?', [req.params.id])
  const own = x && x.user_id === req.user.id
  if (!x || (!own && !isEditor(req))) return res.status(404).json({ error: 'Claim not found.' })
  if (own && req.user.role !== 'admin') {
    if (x.status !== 'unpaid') return res.status(409).json({ error: `This claim is already ${x.status}, so it can no longer be cancelled.` })
    await query("UPDATE reimbursements SET status = 'cancelled' WHERE id = ?", [x.id])
    return res.json({ ok: true })
  }
  if (['paid', 'cancelled'].includes(x.status)) return res.status(409).json({ error: `This claim is already ${x.status}.` })
  await query("UPDATE reimbursements SET status = 'cancelled', decided_by = ?, decided_at = NOW(), decision_note = ? WHERE id = ?", [req.user.id, note, x.id])
  res.json({ ok: true })
})

// Payment status (needs edit). Nobody changes their own claim except an admin. A cancelled claim stays cancelled.
r.post('/:id/status', requirePerm('reimbursements', 'edit'), async (req, res) => {
  const b = z.object({ status: z.enum(['unpaid', 'pending', 'hold', 'paid']), note: z.string().trim().max(255).optional() }).parse(req.body)
  const [x] = await query('SELECT id, user_id, status FROM reimbursements WHERE id = ?', [req.params.id])
  if (!x) return res.status(404).json({ error: 'Claim not found.' })
  if (x.user_id === req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'You cannot change the status of your own claim.' })
  if (x.status === 'cancelled') return res.status(409).json({ error: 'This claim was cancelled.' })
  await query('UPDATE reimbursements SET status = ?, decided_by = ?, decided_at = NOW(), decision_note = ? WHERE id = ?', [b.status, req.user.id, b.note || null, x.id])
  res.json({ ok: true })
})

export default r
