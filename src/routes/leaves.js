// Leave & Permission requests.
//   view   = see your own requests and balance
//   create = apply for leave / permission
//   edit   = see everyone's requests and approve / reject them
import { Router } from 'express'
import { z } from 'zod'
import { query, transaction } from '../db.js'
import { requirePerm } from '../middleware/permissions.js'
import config from '../config.js'

const r = Router()

// Leave days allowed per calendar year (pending + approved count against it).
export const LEAVE_DAYS_PER_YEAR = Number(process.env.LEAVE_DAYS_PER_YEAR) || 15
const COUNTED = "('pending','approved')"
const MAX_SPAN_DAYS = 62

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.')
const hm = z.string().regex(/^\d{2}:\d{2}$/, 'Pick a time.')
const subject = z.string().trim().min(1, 'Subject is required.').max(160)
const reason = z.string().trim().min(1, 'Reason is required.').max(2000)

const fail = (status, message) => Object.assign(new Error(message), { status })
const isoAdd = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const weekday = iso => new Date(iso + 'T00:00:00Z').getUTCDay()
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

// "Today" and "now" in the office time zone (India by default), whatever zone the server runs in.
function officeNow() {
  const t = new Date(Date.now() + config.attendance.tzOffsetMinutes * 60000)
  return { date: t.toISOString().slice(0, 10), minutes: t.getUTCHours() * 60 + t.getUTCMinutes() }
}

const nice = iso =>new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

// Working days in from..to (inclusive): Saturdays, Sundays and active holidays are skipped.
async function workingDays(db, from, to) {
  const hol = await db.query("SELECT holiday_date, name FROM holidays WHERE status = 'active' AND holiday_date BETWEEN ? AND ?", [from, to])
  const holidays = new Map(hol.map(h => [String(h.holiday_date).slice(0, 10), h.name]))
  let days = 0, weekends = 0
  const skippedHolidays = []
  for (let d = from; d <= to; d = isoAdd(d, 1)) {
    if ([0, 6].includes(weekday(d))) { weekends++; continue }
    if (holidays.has(d)) { skippedHolidays.push({ date: d, name: holidays.get(d) }); continue }
    days++
  }
  return { days, weekends, holidays: skippedHolidays }
}

// Leave days already used (pending + approved) in a year.
async function usedDays(db, userId, year) {
  const [row] = await db.query(
    `SELECT COALESCE(SUM(days), 0) AS used FROM leave_requests
      WHERE user_id = ? AND type = 'leave' AND status IN ${COUNTED} AND YEAR(from_date) = ?`, [userId, year])
  return Number(row.used)
}

// Checks a leave request and returns its working-day count and the balance it leaves.
async function checkLeave(db, userId, from, to) {
  if (from < officeNow().date) throw fail(400, 'Leave cannot start in the past. Pick today or a later date.')
  if (to < from) throw fail(400, 'The "to" date must be the same as or after the "from" date.')
  if (from.slice(0, 4) !== to.slice(0, 4)) throw fail(400, 'A leave cannot cross into the next year. Apply for each year separately.')
  const span = (Date.parse(to) - Date.parse(from)) / 86400000 + 1
  if (span > MAX_SPAN_DAYS) throw fail(400, `A single leave can cover at most ${MAX_SPAN_DAYS} days.`)
  const wd = await workingDays(db, from, to)
  if (wd.days === 0) throw fail(400, 'Those dates are all weekends or holidays, so no leave is needed.')
  const year = Number(from.slice(0, 4))
  const used = await usedDays(db, userId, year)
  const remaining = LEAVE_DAYS_PER_YEAR - used
  return { ...wd, year, quota: LEAVE_DAYS_PER_YEAR, used, remaining, remainingAfter: remaining - wd.days }
}

async function assertNoOverlap(db, userId, from, to, start, end) {
  const rows = await db.query(
    `SELECT type, from_date, to_date, start_time, end_time FROM leave_requests
      WHERE user_id = ? AND status IN ${COUNTED} AND from_date <= ? AND to_date >= ?`, [userId, to, from])
  for (const x of rows) {
    if (x.type === 'leave') throw fail(409, `You already have leave from ${nice(String(x.from_date))} to ${nice(String(x.to_date))}.`)
    // Permission vs permission on the same day: only a clash if the times overlap.
    if (start && end) {
      if (toMin(start) < toMin(String(x.end_time).slice(0, 5)) && toMin(end) > toMin(String(x.start_time).slice(0, 5))) {
        throw fail(409, `You already have a permission from ${String(x.start_time).slice(0, 5)} to ${String(x.end_time).slice(0, 5)} that day.`)
      }
    } else {
      throw fail(409, `You already have a permission on ${nice(String(x.from_date))}. Cancel it first or pick other dates.`)
    }
  }
}

const db = { query }

// Balance for the signed-in user.
r.get('/summary', requirePerm('leave', 'view'), async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear()
  const [row] = await query(
    `SELECT COALESCE(SUM(CASE WHEN status = 'approved' THEN days END), 0) AS approved,
            COALESCE(SUM(CASE WHEN status = 'pending' THEN days END), 0) AS pending
       FROM leave_requests WHERE user_id = ? AND type = 'leave' AND YEAR(from_date) = ?`, [req.user.id, year])
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [perm] = await query(
    `SELECT COUNT(*) AS n, COALESCE(SUM(minutes), 0) AS minutes FROM leave_requests
      WHERE user_id = ? AND type = 'permission' AND status IN ${COUNTED} AND DATE_FORMAT(from_date, '%Y-%m') = ?`, [req.user.id, ym])
  const approved = Number(row.approved), pending = Number(row.pending)
  res.json({
    year, quota: LEAVE_DAYS_PER_YEAR, approved, pending, used: approved + pending,
    remaining: LEAVE_DAYS_PER_YEAR - approved - pending,
    permissionsThisMonth: Number(perm.n), permissionMinutesThisMonth: Number(perm.minutes),
  })
})

// Live preview for the apply-leave form: working days and the balance afterwards.
r.post('/preview', requirePerm('leave', 'create'), async (req, res) => {
  const b = z.object({ from_date: ymd, to_date: ymd }).parse(req.body)
  res.json(await checkLeave(db, req.user.id, b.from_date, b.to_date))
})

// List. scope=mine (default) or scope=team (needs edit). Optional year / type / status filters.
r.get('/', async (req, res, next) => (req.query.scope === 'team' ? requirePerm('leave', 'edit') : requirePerm('leave', 'view'))(req, res, next), async (req, res) => {
  const team = req.query.scope === 'team'
  const year = Number(req.query.year) || new Date().getFullYear()
  const where = ['YEAR(l.from_date) = ?']
  const params = [year]
  if (!team) { where.push('l.user_id = ?'); params.push(req.user.id) }
  if (['leave', 'permission'].includes(req.query.type)) { where.push('l.type = ?'); params.push(req.query.type) }
  if (['pending', 'approved', 'rejected', 'cancelled'].includes(req.query.status)) { where.push('l.status = ?'); params.push(req.query.status) }

  const rows = await query(
    `SELECT l.*, u.name AS user_name, u.email AS user_email, e.photo, e.emp_no, d.name AS decided_by_name
       FROM leave_requests l
       JOIN users u ON u.id = l.user_id
       LEFT JOIN employees e ON e.user_id = l.user_id
       LEFT JOIN users d ON d.id = l.decided_by
      WHERE ${where.join(' AND ')}
      ORDER BY l.from_date DESC, l.id DESC`, params)

  // Balance left after each counted leave, in date order, per person.
  const counted = await query(
    `SELECT id, user_id, days FROM leave_requests
      WHERE type = 'leave' AND status IN ${COUNTED} AND YEAR(from_date) = ? ${team ? '' : 'AND user_id = ?'}
      ORDER BY user_id, from_date, id`, team ? [year] : [year, req.user.id])
  const after = new Map()
  const running = new Map()
  for (const c of counted) {
    const used = (running.get(c.user_id) || 0) + Number(c.days)
    running.set(c.user_id, used)
    after.set(c.id, LEAVE_DAYS_PER_YEAR - used)
  }

  res.json({
    year, quota: LEAVE_DAYS_PER_YEAR,
    requests: rows.map(x => ({
      ...x,
      start_time: x.start_time ? String(x.start_time).slice(0, 5) : null,
      end_time: x.end_time ? String(x.end_time).slice(0, 5) : null,
      balance_after: after.has(x.id) ? after.get(x.id) : null,
      mine: x.user_id === req.user.id,
    })),
  })
})

const leaveBody = z.object({ type: z.literal('leave'), from_date: ymd, to_date: ymd, subject, reason })
const permissionBody = z.object({ type: z.literal('permission'), date: ymd, start_time: hm, end_time: hm, subject, reason })
  .refine(v => toMin(v.end_time) > toMin(v.start_time), { message: 'The "to" time must be after the "from" time.', path: ['end_time'] })
const body = z.discriminatedUnion('type', [leaveBody, permissionBody])

r.post('/', requirePerm('leave', 'create'), async (req, res) => {
  const b = body.parse(req.body)
  const out = await transaction(async tx => {
    // Lock this user's row so two quick submissions cannot both pass the quota check.
    await tx.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.user.id])

    if (b.type === 'leave') {
      const c = await checkLeave(tx, req.user.id, b.from_date, b.to_date)
      if (c.remainingAfter < 0) {
        throw fail(400, c.remaining <= 0
          ? `You have used all ${c.quota} leave days for ${c.year}.`
          : `This leave needs ${c.days} working day${c.days > 1 ? 's' : ''}, but you only have ${c.remaining} of ${c.quota} left for ${c.year}.`)
      }
      await assertNoOverlap(tx, req.user.id, b.from_date, b.to_date)
      const { insertId } = await tx.query(
        `INSERT INTO leave_requests (user_id, type, from_date, to_date, days, subject, reason) VALUES (?, 'leave', ?, ?, ?, ?, ?)`,
        [req.user.id, b.from_date, b.to_date, c.days, b.subject, b.reason])
      return { id: insertId, days: c.days, remaining: c.remainingAfter, quota: c.quota }
    }

    // Permission: today or later; today only from the current time onwards.
    const now = officeNow()
    if (b.date < now.date) throw fail(400, 'Permission cannot be for a past date. Pick today or a later date.')
    if (b.date === now.date && toMin(b.start_time) < now.minutes) {
      throw fail(400, `That time has already passed. For today, pick a start time from ${hhmm(now.minutes)} onwards.`)
    }
    // A working day, no clash with leave or another permission.
    if ([0, 6].includes(weekday(b.date))) throw fail(400, 'That date is a weekend. Permission is only needed on working days.')
    const [hol] = await tx.query("SELECT name FROM holidays WHERE status = 'active' AND holiday_date = ?", [b.date])
    if (hol) throw fail(400, `That date is a holiday (${hol.name}).`)
    await assertNoOverlap(tx, req.user.id, b.date, b.date, b.start_time, b.end_time)
    const minutes = toMin(b.end_time) - toMin(b.start_time)
    const { insertId } = await tx.query(
      `INSERT INTO leave_requests (user_id, type, from_date, to_date, start_time, end_time, minutes, subject, reason)
       VALUES (?, 'permission', ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, b.date, b.date, b.start_time, b.end_time, minutes, b.subject, b.reason])
    return { id: insertId, minutes }
  })
  res.status(201).json(out)
})

// Cancel. The applicant can withdraw their own request while it is pending.
// Someone with edit access can cancel a teammate's pending or approved request (recorded as theirs).
r.post('/:id/cancel', requirePerm('leave', 'view'), async (req, res) => {
  const note = z.object({ note: z.string().trim().max(255).optional() }).parse(req.body || {}).note || null
  const [x] = await query('SELECT id, user_id, status FROM leave_requests WHERE id = ?', [req.params.id])
  const editor = !!req.perms.modules.leave?.edit
  const own = x && x.user_id === req.user.id
  if (!x || (!own && !editor)) return res.status(404).json({ error: 'Request not found.' })
  if (own && req.user.role !== 'admin') {
    if (x.status !== 'pending') return res.status(409).json({ error: `This request is already ${x.status}.` })
    await query("UPDATE leave_requests SET status = 'cancelled' WHERE id = ?", [x.id])
    return res.json({ ok: true })
  }
  if (!['pending', 'approved'].includes(x.status)) return res.status(409).json({ error: `This request is already ${x.status}.` })
  await query("UPDATE leave_requests SET status = 'cancelled', decided_by = ?, decided_at = NOW(), decision_note = ? WHERE id = ?",
    [req.user.id, note, x.id])
  res.json({ ok: true })
})

// Approve or reject (needs edit). Nobody decides their own request except an admin.
r.post('/:id/decision', requirePerm('leave', 'edit'), async (req, res) => {
  const b = z.object({ status: z.enum(['approved', 'rejected']), note: z.string().trim().max(255).optional() }).parse(req.body)
  const [x] = await query('SELECT id, user_id, status FROM leave_requests WHERE id = ?', [req.params.id])
  if (!x) return res.status(404).json({ error: 'Request not found.' })
  if (x.user_id === req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'You cannot approve or reject your own request.' })
  if (x.status !== 'pending') return res.status(409).json({ error: `This request is already ${x.status}.` })
  await query('UPDATE leave_requests SET status = ?, decided_by = ?, decided_at = NOW(), decision_note = ? WHERE id = ?',
    [b.status, req.user.id, b.note || null, x.id])
  res.json({ ok: true })
})

export default r
