import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { ZodError } from 'zod'
import config from './config.js'
import { requireAuth, requireAppHeader } from './middleware/auth.js'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import projectRoutes from './routes/projects.js'
import proposalRoutes from './routes/proposals.js'
import timelineRoutes from './routes/timelines.js'
import assistantRoutes from './routes/assistant.js'
import crRoutes from './routes/crs.js'

const app = express()
app.set('trust proxy', 1)
app.use(helmet())
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use('/api', requireAppHeader)

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.use('/api/auth', authRoutes)
app.use('/api/users', requireAuth, userRoutes)
app.use('/api/projects/:id/proposal', requireAuth, proposalRoutes)
app.use('/api/projects/:id/timelines', requireAuth, timelineRoutes)
app.use('/api/projects/:id/assistant', requireAuth, assistantRoutes)
app.use('/api/projects/:id', requireAuth, crRoutes)
app.use('/api/projects', requireAuth, projectRoutes)

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }))

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message || 'Check the details and try again.' })
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message })
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request.' })
  console.error(err)
  res.status(500).json({ error: 'Something went wrong. Please try again.' })
})

app.listen(config.port, () => console.log(`project-tracker-api listening on ${config.port} (${config.env})`))
