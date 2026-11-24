import jwt from 'jsonwebtoken'
import config from '../config.js'
import { query } from '../db.js'

export const COOKIE = 'pt_session'
export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.env === 'production',
  path: '/',
  maxAge: config.sessionHours * 3600 * 1000,
}

export const signSession = user => jwt.sign({ uid: user.id }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` })

export const publicUser = u => ({
  id: u.id, name: u.name, email: u.email, role: u.role,
  clientAccess: u.client_access, mustChangePassword: !!u.must_change_password,
})

// The user is re-read on every request, so deactivating someone takes effect immediately.
export async function requireAuth(req, res, next) {
  try {
    const { uid } = jwt.verify(req.cookies?.[COOKIE] || '', config.jwtSecret)
    const [user] = await query('SELECT * FROM users WHERE id = ?', [uid])
    if (!user || user.status !== 'active') throw new Error('inactive')
    req.user = user
    next()
  } catch {
    res.status(401).json({ error: 'Please sign in.' })
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have access to this.' })

// Browsers cannot add this header on a cross-site form post, so it blocks CSRF on changes.
export const requireAppHeader = (req, res, next) =>
  ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.get('X-Requested-With') === 'tracker-ui'
    ? next() : res.status(403).json({ error: 'Request blocked.' })
