import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { ZodError } from 'zod'
import multer from 'multer'
import config from './config.js'
import { requireAppHeader, requireAuth } from './middleware/auth.js'
import authRoutes from './routes/auth.js'
import agentRoutes from './routes/agent.js'
import attendanceRoutes from './routes/attendance.js'
import siteRuleRoutes from './routes/siteRules.js'
import officeNetworkRoutes from './routes/officeNetworks.js'
import roleRoutes from './routes/roles.js'
import employeeRoutes from './routes/employees.js'
import projectRoutes from './routes/projectMaster.js'
import configRoutes from './routes/config.js'
import holidayRoutes from './routes/holidays.js'
import eventRoutes from './routes/events.js'
import permissionRoutes from './routes/permissions.js'
import leaveRoutes from './routes/leaves.js'
import projectRepoRoutes from './routes/projectRepositories.js'
import reimbursementRoutes from './routes/reimbursements.js'
import workAllotmentRoutes from './routes/workAllotments.js'
import ticketRoutes from './routes/tickets.js'

const app = express()
app.set('trust proxy', 1)
app.use(helmet())
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
// The desktop agent uses a device token, not the browser cookie, so it is mounted before the CSRF header check.
app.use('/api/agent', agentRoutes)

app.get('/api/health', (req, res) => res.json({ ok: true }))

// Uploaded employee photos (read-only, same origin through the dev proxy).
app.use('/api/uploads', express.static(config.uploadDir))

app.use('/api', requireAppHeader)

// Login/logout is owned by a colleague; masters require a signed-in session.
app.use('/api/auth', authRoutes)
app.use('/api/roles', requireAuth, roleRoutes)
app.use('/api/permissions', requireAuth, permissionRoutes)
app.use('/api/employees', requireAuth, employeeRoutes)
app.use('/api/project-master', requireAuth, projectRoutes)
app.use('/api/config', configRoutes)
app.use('/api/holidays', holidayRoutes)
app.use('/api/events', eventRoutes)
app.use('/api/leaves', requireAuth, leaveRoutes)
app.use('/api/project-repositories', requireAuth, projectRepoRoutes)
app.use('/api/reimbursements', requireAuth, reimbursementRoutes)
app.use('/api/work-allotments', requireAuth, workAllotmentRoutes)
app.use('/api/tickets', requireAuth, ticketRoutes)
app.use('/api/attendance', requireAuth, attendanceRoutes)
app.use('/api/site-rules', requireAuth, siteRuleRoutes)
app.use('/api/office-networks', requireAuth, officeNetworkRoutes)

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }))

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message || 'Check the details and try again.' })
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'The image is too large (max 5 MB).' : 'Upload failed.' })
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message })
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request.' })
  console.error(err)
  res.status(500).json({ error: 'Something went wrong. Please try again.' })
})

app.listen(config.port, () => console.log(`imaginet-tracker-api listening on ${config.port} (${config.env})`))
