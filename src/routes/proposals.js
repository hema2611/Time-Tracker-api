import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import config from '../config.js'
import { query, audit } from '../db.js'
import { aiReady, readProposal, friendlyAiError } from '../ai/index.js'

const r = Router({ mergeParams: true })
const db = { query }
const MAX_MB = 20
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 } }).single('file')

// Only the admin or the project's team lead may upload a proposal (and so spend AI usage).
async function loadProject(req, res, next) {
  const [project] = await query('SELECT id, tl_id FROM projects WHERE id = ?', [+req.params.id])
  if (!project) return res.status(404).json({ error: 'Project not found.' })
  if (req.user.role !== 'admin' && project.tl_id !== req.user.id) return res.status(403).json({ error: 'You do not have access to this.' })
  req.project = project
  next()
}

r.post('/', loadProject, (req, res, next) => upload(req, res, err => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: `The file is larger than ${MAX_MB} MB.` })
  err ? next(err) : next()
}), async (req, res) => {
  const file = req.file
  if (!file) return res.status(400).json({ error: 'Choose a PDF file.' })
  if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return res.status(400).json({ error: 'This is not a PDF file.' })

  // 1. Keep the file as the next proposal version.
  const sha = crypto.createHash('sha256').update(file.buffer).digest('hex')
  const [{ v }] = await query('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM proposals WHERE project_id = ?', [req.project.id])
  const rel = path.join('proposals', String(req.project.id), `v${v}_${sha.slice(0, 12)}.pdf`)
  await fs.mkdir(path.dirname(path.join(config.uploadDir, rel)), { recursive: true })
  await fs.writeFile(path.join(config.uploadDir, rel), file.buffer)
  const fileName = path.basename(Buffer.from(file.originalname, 'latin1').toString('utf8')).slice(0, 255)
  const { insertId: proposalId } = await query(
    'INSERT INTO proposals (project_id, version, file_name, stored_path, size_bytes, sha256, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.project.id, v, fileName, rel.replaceAll('\\', '/'), file.size, sha, req.user.id])
  await audit(db, req, 'proposal_uploaded', 'proposal', proposalId, { projectId: req.project.id, version: v, fileName })
  const proposal = { id: proposalId, version: v, fileName }

  // 2. Ask the AI to read it. The upload is already safe whatever happens here.
  //    ?read=0 stores the file only (the user chose to enter their own timeline), so no AI usage is spent.
  if (req.query.read === '0') return res.status(201).json({ proposal, ai: { status: 'skipped' } })
  res.status(201).json({ proposal, ...await runReading(req, proposalId, file.buffer) })
})

// Read the latest stored proposal again (after a failed or empty read) without uploading it again.
r.post('/read', loadProject, async (req, res) => {
  const [p] = await query('SELECT id, version, file_name AS fileName, stored_path FROM proposals WHERE project_id = ? ORDER BY version DESC LIMIT 1', [req.project.id])
  if (!p) return res.status(404).json({ error: 'This project has no proposal yet.' })
  let buffer
  try { buffer = await fs.readFile(path.join(config.uploadDir, p.stored_path)) } catch { return res.status(410).json({ error: 'The stored proposal file is missing. Upload it again.' }) }
  await audit(db, req, 'proposal_reread', 'proposal', p.id, { projectId: req.project.id })
  res.json({ proposal: { id: p.id, version: p.version, fileName: p.fileName }, ...await runReading(req, p.id, buffer) })
})

// One AI read: checks the daily limit, calls the provider, logs the result either way.
async function runReading(req, proposalId, buffer) {
  if (!aiReady()) return { ai: { status: 'not_configured', message: 'AI reading is not set up on the server yet.' } }
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM proposal_readings WHERE requested_by = ? AND created_at >= CURDATE()', [req.user.id])
  if (n >= config.ai.dailyLimitPerUser) return { ai: { status: 'limit_reached', message: `You have used today's ${config.ai.dailyLimitPerUser} AI reads. Try again tomorrow.` } }
  try {
    const out = await readProposal(buffer)
    await query(
      "INSERT INTO proposal_readings (proposal_id, provider, model, status, result, input_tokens, output_tokens, requested_by) VALUES (?, ?, ?, 'ok', ?, ?, ?, ?)",
      [proposalId, out.provider, out.model, JSON.stringify(out.data), out.inputTokens, out.outputTokens, req.user.id])
    return { ai: { status: 'ok', provider: out.provider, model: out.model }, reading: out.data }
  } catch (err) {
    console.error(`proposal reading failed (proposal ${proposalId}): ${err?.status ?? ''} ${String(err?.message || err).slice(0, 300)}`)
    await query(
      "INSERT INTO proposal_readings (proposal_id, provider, model, status, error, requested_by) VALUES (?, ?, ?, 'failed', ?, ?)",
      [proposalId, config.ai.provider, config.ai.geminiModel, String(err?.message || err).slice(0, 500), req.user.id])
    return { ai: { status: 'failed', message: friendlyAiError(err) } }
  }
}

export default r
