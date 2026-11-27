import { Router } from 'express'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { sendMail } from '../mailer.js'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { query, audit } from '../db.js'
import { COOKIE, cookieOptions, signSession, publicUser, requireAuth } from '../middleware/auth.js'

const r = Router()
const db = { query }
export const passwordRule = z.string().min(10, 'Password must be at least 10 characters.').max(100)

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' } })

r.post('/login', loginLimit, async (req, res) => {
  const { email, password } = z.object({ email: z.string().trim().toLowerCase(), password: z.string() }).parse(req.body)
  const [user] = await query('SELECT * FROM users WHERE email = ?', [email])
  // Same message for every failure, so nobody can find out which emails exist.
  const ok = user?.password_hash && user.status === 'active' && await bcrypt.compare(password, user.password_hash)
  if (!ok) {
    await audit(db, req, 'login_failed', 'user', user?.id ?? null, { email })
    return res.status(401).json({ error: 'Email or password is wrong.' })
  }
  await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id])
  req.user = user
  await audit(db, req, 'login', 'user', user.id)
  res.cookie(COOKIE, signSession(user), cookieOptions).json({ user: publicUser(user) })
})

r.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined }).json({ ok: true })
})

r.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }))

r.post('/change-password', requireAuth, async (req, res) => {
  const { current, next } = z.object({ current: z.string(), next: passwordRule }).parse(req.body)
  if (!await bcrypt.compare(current, req.user.password_hash)) return res.status(400).json({ error: 'Current password is wrong.' })
  if (current === next) return res.status(400).json({ error: 'Choose a different password.' })
  // Other devices are signed out; this one gets a fresh session so the person stays signed in here.
  await query('UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = UTC_TIMESTAMP() WHERE id = ?', [await bcrypt.hash(next, 12), req.user.id])
  await audit(db, req, 'password_changed', 'user', req.user.id)
  await new Promise(r => setTimeout(r, 1000)) // the new session must be signed in a later second than password_changed_at
  res.cookie(COOKIE, signSession(req.user), cookieOptions).json({ ok: true })
})

// ---- Forgot password: a one-time link by email (30 minutes, single use) ----
const RESET_MINUTES = 30
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex')
const webUrl = () => (process.env.WEB_URL || 'http://localhost:5181').replace(/\/$/, '')
// Per address: 5 requests an hour. Per email: at most one new link every 2 minutes (checked below).
const forgotLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Try again in an hour.' } })
const resetLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' } })

r.post('/forgot', forgotLimit, async (req, res) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address.') }).parse(req.body)
  // The answer is the same whether or not the email has an account, so nobody can find out which emails exist.
  const done = () => res.json({ ok: true })
  const [user] = await query("SELECT id, name, email, role, status FROM users WHERE email = ?", [email])
  if (!user || user.status !== 'active' || user.role === 'client') {
    await audit(db, req, 'password_reset_requested_unknown', 'user', user?.id ?? null, { email })
    return done()
  }
  const [recent] = await query('SELECT id FROM password_resets WHERE user_id = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 2 MINUTE', [user.id])
  if (recent) return done()
  const token = crypto.randomBytes(32).toString('base64url')
  await query('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [user.id]) // older links stop working
  await query('INSERT INTO password_resets (user_id, token_hash, expires_at, ip, created_at) VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE, ?, UTC_TIMESTAMP())',
    [user.id, sha256(token), RESET_MINUTES, req.ip])
  const link = `${webUrl()}/reset-password?token=${token}`
  const first = (user.name || '').split(' ')[0] || 'there'
  try {
    await sendMail({
      to: user.email,
      subject: 'Reset your ImagiNET Tracker password',
      text: `Hi ${first},\n\nSomeone asked to reset the password for your ImagiNET Tracker account.\nOpen this link to choose a new one (it works once, for ${RESET_MINUTES} minutes):\n\n${link}\n\nIf this wasn't you, ignore this email. Your password stays the same.\n\nImagiNET Tracker`,
      html: `<div style="font:14px/1.5 Inter,Segoe UI,Arial,sans-serif;color:#1A0833;max-width:480px">
        <p>Hi ${first.replace(/[<>&"]/g, '')},</p>
        <p>Someone asked to reset the password for your ImagiNET Tracker account. Use the button to choose a new one. It works once, for ${RESET_MINUTES} minutes.</p>
        <p><a href="${link}" style="display:inline-block;padding:11px 20px;border-radius:11px;background:#68428C;color:#fff;text-decoration:none;font-weight:500">Choose a new password</a></p>
        <p style="color:#55486B">If this wasn’t you, ignore this email. Your password stays the same.</p>
        <p style="color:#7A6E8F;font-size:12px">ImagiNET Tracker</p></div>`,
    })
    await audit(db, req, 'password_reset_requested', 'user', user.id)
  } catch (e) {
    console.error('reset mail failed:', e.message)
    await audit(db, req, 'password_reset_mail_failed', 'user', user.id, { error: e.message.slice(0, 200) })
  }
  done()
})

// Checks a link before the form is shown, so an expired link says so straight away.
r.get('/reset/:token', resetLimit, async (req, res) => {
  const [row] = await query('SELECT id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()', [sha256(req.params.token)])
  res.json({ valid: !!row })
})

r.post('/reset', resetLimit, async (req, res) => {
  const { token, password } = z.object({ token: z.string().min(20).max(100), password: passwordRule }).parse(req.body)
  const [row] = await query(
    `SELECT pr.id, pr.user_id FROM password_resets pr JOIN users u ON u.id = pr.user_id
      WHERE pr.token_hash = ? AND pr.used_at IS NULL AND pr.expires_at > UTC_TIMESTAMP() AND u.status = 'active'`, [sha256(token)])
  if (!row) return res.status(400).json({ error: 'This link has expired or was already used. Ask for a new one.' })
  await query('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [row.user_id])
  // Every existing session (any device) is signed out by password_changed_at.
  await query('UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = UTC_TIMESTAMP() WHERE id = ?',
    [await bcrypt.hash(password, 12), row.user_id])
  await audit(db, req, 'password_reset_done', 'user', row.user_id)
  res.json({ ok: true })
})

export default r
