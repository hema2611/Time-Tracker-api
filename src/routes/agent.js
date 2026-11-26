// Desktop agent endpoints. The agent signs in once (pair) and then uses a device token,
// sent as "Authorization: Bearer <token>". No cookies are involved, so CSRF does not apply.
import { Router } from 'express'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { query, audit } from '../db.js'
import { dayFor, today } from '../attendance.js'

const r = Router()
const db = { query }
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex')

const EVENT_TYPES = ['agent_start', 'agent_quit', 'heartbeat', 'suspend', 'resume', 'lock', 'unlock', 'idle_start', 'idle_end', 'shutdown', 'break_reason', 'flagged_use', 'location']

const pairLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' } })

// Sign in from the agent: checks the tracker email + password and pairs this computer.
// The token is returned once; the server keeps only its hash.
r.post('/pair', pairLimit, async (req, res) => {
  const b = z.object({
    email: z.string().trim().toLowerCase(),
    password: z.string(),
    deviceName: z.string().trim().min(1).max(120),
    platform: z.enum(['windows', 'mac', 'linux']),
    version: z.string().max(20).optional(),
  }).parse(req.body)
  const [user] = await query('SELECT * FROM users WHERE email = ?', [b.email])
  const ok = user?.password_hash && user.status === 'active' && await bcrypt.compare(b.password, user.password_hash)
  if (!ok) {
    await audit(db, req, 'agent_pair_failed', 'user', user?.id ?? null, { email: b.email, device: b.deviceName })
    return res.status(401).json({ error: 'Email or password is wrong.' })
  }
  // Only the team's working hours are tracked: client accounts cannot use the agent.
  if (user.role === 'client') {
    await audit(db, req, 'agent_pair_refused', 'user', user.id, { reason: 'client account', device: b.deviceName })
    return res.status(403).json({ error: 'Client accounts cannot use the desktop agent.' })
  }
  const token = crypto.randomBytes(32).toString('hex')
  const { insertId } = await query(
    'INSERT INTO agent_devices (user_id, name, platform, agent_version, token_hash, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
    [user.id, b.deviceName, b.platform, b.version ?? null, sha256(token)])
  req.user = user
  await audit(db, req, 'agent_paired', 'agent_device', insertId, { device: b.deviceName, platform: b.platform })
  res.json({ token, device: { id: insertId, name: b.deviceName }, user: { id: user.id, name: user.name, email: user.email } })
})

// Every other agent call needs a valid, not-revoked device token of an active user.
// 401 only when the token is really unknown/revoked: the agent then forgets its sign-in.
// A database problem must NOT look like that (it would sign every computer out), so it is a 503.
async function requireDevice(req, res, next) {
  const signedOut = () => res.status(401).json({ error: 'This computer is not signed in. Sign in again from the agent.' })
  const token = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!/^[0-9a-f]{64}$/.test(token)) return signedOut()
  let d
  try {
    [d] = await query(
      `SELECT d.id, d.user_id, d.name, u.name AS user_name, u.email AS user_email, u.status, u.role
         FROM agent_devices d JOIN users u ON u.id = d.user_id
        WHERE d.token_hash = ? AND d.revoked_at IS NULL`, [sha256(token)])
  } catch (e) {
    console.error('agent auth: database error', e.message)
    return res.status(503).json({ error: 'Server busy. Try again shortly.' })
  }
  if (!d || d.status !== 'active' || d.role === 'client') return signedOut()
  req.device = d
  next()
}

// The unproductive sites/apps this person's agent should watch for (rules that allow their role are left out).
r.get('/rules', requireDevice, async (req, res) => {
  const [u] = await query('SELECT role FROM users WHERE id = ?', [req.device.user_id])
  const rules = await query("SELECT kind, pattern, label, allow_roles FROM site_rules WHERE rating = 'unproductive'")
  res.json({ rules: rules.filter(x => !(x.allow_roles || '').split(',').includes(u?.role)).map(({ kind, pattern, label }) => ({ kind, pattern, label })) })
})

// The person's own day so far, for the agent window (timer ring, day strip, status).
r.get('/today', requireDevice, async (req, res) => {
  const d = await dayFor(req.device.user_id, today())
  res.json({ status: d.status, firstIn: d.firstIn, workMinutes: d.workMinutes, deskWorkMinutes: d.deskWorkMinutes,
    awayWorkMinutes: d.awayWorkMinutes, idleMinutes: d.idleMinutes, breakMinutes: d.breakMinutes, pieces: d.pieces, at: new Date().toISOString() })
})

r.get('/me', requireDevice, (req, res) =>
  res.json({ device: { id: req.device.id, name: req.device.name }, user: { name: req.device.user_name, email: req.device.user_email } }))

// A batch of events (the agent queues them while offline and sends them later).
// Re-sent events are ignored thanks to (device_id, client_id).
r.post('/events', requireDevice, async (req, res) => {
  const { events, version } = z.object({
    version: z.string().max(20).optional(),
    events: z.array(z.object({
      id: z.string().uuid(),
      type: z.enum(EVENT_TYPES),
      at: z.string().datetime({ offset: true }),
      detail: z.record(z.string(), z.unknown()).optional(),
    })).min(1).max(500),
  }).parse(req.body)

  // Clocks can be off a little; anything far in the future is refused, not trusted.
  const latest = Date.now() + 5 * 60 * 1000
  const rows = events.filter(e => new Date(e.at).getTime() <= latest)
  for (const e of rows) {
    await query(
      'INSERT IGNORE INTO activity_events (device_id, user_id, type, occurred_at, received_at, ip, client_id, detail) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), ?, ?, ?)',
      [req.device.id, req.device.user_id, e.type, new Date(e.at).toISOString().slice(0, 23).replace('T', ' '), (req.ip || '').slice(0, 45), e.id,
        e.detail ? JSON.stringify(e.detail) : null])
  }
  await query('UPDATE agent_devices SET last_seen_at = UTC_TIMESTAMP(), last_ip = ?, agent_version = COALESCE(?, agent_version) WHERE id = ?',
    [(req.ip || '').slice(0, 45), version ?? null, req.device.id])
  // Every event the agent sent is confirmed, so it can drop them from its queue (future-dated ones are dropped too).
  res.json({ accepted: events.map(e => e.id), stored: rows.length })
})

export default r
