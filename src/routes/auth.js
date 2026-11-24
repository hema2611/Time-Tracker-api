import { Router } from 'express'
import bcrypt from 'bcryptjs'
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
  await query('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [await bcrypt.hash(next, 12), req.user.id])
  await audit(db, req, 'password_changed', 'user', req.user.id)
  res.json({ ok: true })
})

export default r
