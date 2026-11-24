import { Router } from 'express'
import { z } from 'zod'
import config from '../config.js'
import { query } from '../db.js'
import { aiReady, assistantReply, friendlyAiError } from '../ai/index.js'

const r = Router({ mergeParams: true })
const short = max => z.string().trim().max(max)

const Body = z.object({
  message: short(1000).min(1, 'Type a message.'),
  history: z.array(z.object({ who: z.enum(['user', 'assistant']), text: short(1500) })).max(12).default([]),
  proposal: z.object({
    modules: z.array(z.object({ name: short(255), features: z.array(short(255)).max(80) })).max(60),
    outOfScope: z.array(short(255)).max(60),
    totalMonths: z.number().nullish(),
  }).nullish(),
  timeline: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    workingDays: z.number().int().min(0),
    mode: z.enum(['seq', 'overlap']),
    rows: z.array(z.object({ kind: z.enum(['module', 'section']), name: short(255), days: z.number().min(0), basis: z.enum(['user', 'proposal', 'assumed']) })).max(1500),
  }),
})

// Timeline assistant chat. Only the admin or the project's team lead may use it.
r.post('/', async (req, res) => {
  const [project] = await query('SELECT id, name, client_company AS client, tl_id FROM projects WHERE id = ?', [+req.params.id])
  if (!project) return res.status(404).json({ error: 'Project not found.' })
  if (req.user.role !== 'admin' && project.tl_id !== req.user.id) return res.status(403).json({ error: 'You do not have access to this.' })
  const b = Body.parse(req.body)

  if (!aiReady()) return res.status(503).json({ error: 'The AI assistant is not set up on the server yet.' })
  const [{ n }] = await query("SELECT COUNT(*) AS n FROM ai_usage WHERE user_id = ? AND purpose = 'timeline_chat' AND created_at >= CURDATE()", [req.user.id])
  if (n >= config.ai.dailyChatLimitPerUser) return res.status(429).json({ error: `You have used today's ${config.ai.dailyChatLimitPerUser} assistant messages. Try again tomorrow.` })

  const log = (status, o = {}) => query(
    "INSERT INTO ai_usage (user_id, project_id, purpose, provider, model, status, input_tokens, output_tokens, error) VALUES (?, ?, 'timeline_chat', ?, ?, ?, ?, ?, ?)",
    [req.user.id, project.id, config.ai.provider, o.model || config.ai.geminiModel, status, o.inputTokens ?? null, o.outputTokens ?? null, o.error ?? null])

  try {
    const out = await assistantReply({ project: { name: project.name, client: project.client }, proposal: b.proposal || null, timeline: b.timeline, history: b.history, message: b.message })
    await log('ok', out)
    res.json({ ...out.data, model: out.model })
  } catch (err) {
    console.error(`assistant failed (project ${project.id}): ${err?.status ?? ''} ${String(err?.message || err).slice(0, 300)}`)
    await log('failed', { error: String(err?.message || err).slice(0, 300) })
    res.status(err?.status === 429 ? 429 : 502).json({ error: friendlyAiError(err) })
  }
})

export default r
