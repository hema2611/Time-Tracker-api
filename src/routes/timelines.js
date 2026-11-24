import { Router } from 'express'
import { z } from 'zod'
import { query, transaction, audit } from '../db.js'

const r = Router({ mergeParams: true })
const dateRule = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD.')

// Read: admin, the team lead, or any member. Write: admin or the team lead only.
async function loadProject(req, res, next) {
  const [project] = await query(
    'SELECT p.id, p.tl_id, EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ?) AS member FROM projects p WHERE p.id = ?',
    [req.user.id, +req.params.id])
  const canWrite = project && (req.user.role === 'admin' || project.tl_id === req.user.id)
  if (!project || !(canWrite || project.member)) return res.status(404).json({ error: 'Project not found.' })
  req.project = project
  req.canWrite = canWrite
  next()
}
r.use(loadProject)

r.get('/latest', async (req, res) => {
  const [timeline] = await query(`
    SELECT t.id, t.version, t.status, t.mode, t.start_date AS start, t.end_date AS end, t.working_days AS workingDays,
           t.created_at AS createdAt, u.name AS createdBy
      FROM timelines t JOIN users u ON u.id = t.created_by
     WHERE t.project_id = ? ORDER BY t.version DESC LIMIT 1`, [req.project.id])
  if (!timeline) return res.json({ timeline: null })
  const items = await query(
    'SELECT id, parent_id AS parentId, kind, name, days, start_date AS start, end_date AS end, source FROM timeline_items WHERE timeline_id = ? ORDER BY position', [timeline.id])
  res.json({ timeline, items })
})

r.post('/', async (req, res) => {
  if (!req.canWrite) return res.status(403).json({ error: 'Only the admin or the team lead can save the timeline.' })
  const b = z.object({
    mode: z.enum(['seq', 'overlap']).default('seq'),
    proposalId: z.number().int().positive().nullish(),
    rows: z.array(z.object({
      kind: z.enum(['module', 'section']),
      name: z.string().trim().min(1, 'Every module and section needs a name.').max(255),
      days: z.number().int().min(0).max(5000),
      start: dateRule,
      end: dateRule,
      source: z.enum(['you', 'proposal', 'ai']),
    })).min(2, 'The timeline is empty.').max(1500),
  }).parse(req.body)

  if (b.rows[0].kind !== 'module') return res.status(400).json({ error: 'The timeline must start with a module.' })
  const sections = b.rows.filter(x => x.kind === 'section')
  if (!sections.length) return res.status(400).json({ error: 'Add at least one section.' })
  if (b.rows.some(x => x.end < x.start)) return res.status(400).json({ error: 'A finish date is before its start date.' })
  if (b.proposalId && !(await query('SELECT id FROM proposals WHERE id = ? AND project_id = ?', [b.proposalId, req.project.id])).length) b.proposalId = null

  // Totals come from the rows themselves, not from what the browser claims.
  const start = b.rows.reduce((m, x) => x.start < m ? x.start : m, b.rows[0].start)
  const end = b.rows.reduce((m, x) => x.end > m ? x.end : m, b.rows[0].end)
  let workingDays = 0
  for (let d = new Date(start + 'T00:00:00Z'); d <= new Date(end + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() % 6) workingDays++

  const out = await transaction(async db => {
    const [{ v }] = await db.query('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM timelines WHERE project_id = ? FOR UPDATE', [req.project.id])
    const { insertId: tid } = await db.query(
      "INSERT INTO timelines (project_id, version, status, mode, start_date, end_date, working_days, proposal_id, created_by) VALUES (?, ?, 'final', ?, ?, ?, ?, ?, ?)",
      [req.project.id, v, b.mode, start, end, workingDays, b.proposalId || null, req.user.id])
    // Two statements instead of one per row: insert every row, then link each section to its module by position.
    await db.query(
      `INSERT INTO timeline_items (timeline_id, kind, position, name, days, start_date, end_date, source) VALUES ${b.rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
      b.rows.flatMap((x, i) => [tid, x.kind, i, x.name, x.days, x.start, x.end, x.source]))
    let parentPos = 0
    const links = b.rows.flatMap((x, i) => { if (x.kind === 'module') { parentPos = i; return [] } return [[i, parentPos]] })
    await db.query(
      `UPDATE timeline_items s
         JOIN (${links.map(() => 'SELECT ? AS pos, ? AS ppos').join(' UNION ALL ')}) x ON x.pos = s.position
         JOIN timeline_items m ON m.timeline_id = s.timeline_id AND m.position = x.ppos
          SET s.parent_id = m.id
        WHERE s.timeline_id = ?`,
      [...links.flat(), tid])
    // The first saved timeline sets the baseline go-live; later versions only move the current date.
    await db.query('UPDATE projects SET start_date = ?, current_golive = ?, baseline_golive = COALESCE(baseline_golive, ?) WHERE id = ?', [start, end, end, req.project.id])
    await audit(db, req, 'timeline_saved', 'timeline', tid, { projectId: req.project.id, version: v, start, end, workingDays, rows: b.rows.length })
    return { id: tid, version: v, start, end, workingDays }
  })
  res.status(201).json({ timeline: out })
})

export default r
