// Working hours from the desktop agent. Everyone on the team sees their own day;
// Admin and team leads also see anyone's day and the "team now" list.
import { Router } from 'express'
import { z } from 'zod'
import { query } from '../db.js'
import ExcelJS from 'exceljs'
import { dayFor, monthFor, today } from '../attendance.js'
import config from '../config.js'

const r = Router()
// Short text for a check-in / check-out place: "Office (Chennai office)", "Remote · Wi-Fi Home", map link if exact.
const placeText = p => !p ? '' : [p.place ? (p.label ? `${p.place} (${p.label})` : p.place) : null, p.wifi ? `Wi-Fi ${p.wifi}` : null].filter(Boolean).join(' · ')
const mapLink = p => (p?.lat !== undefined ? `https://www.google.com/maps?q=${p.lat},${p.lon}` : '')

const canSeeTeam = u => u.role === 'admin' || u.role === 'tl'
// Only these roles are tracked (team lead, developers, designers, testers). Admin and clients are not.
const TRACKED = config.attendance.trackedRoles
const tracked = role => TRACKED.includes(role)
const IN_TRACKED = `role IN (${TRACKED.map(() => '?').join(', ')})`
const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date.').optional()

r.use((req, res, next) => req.user.role === 'client' ? res.status(403).json({ error: 'You do not have access to this.' }) : next())

// One person's day. Default: me, today.
r.get('/day', async (req, res) => {
  const date = dateParam.parse(req.query.date) || today()
  const userId = req.query.userId ? +req.query.userId : req.user.id
  if (userId !== req.user.id && !canSeeTeam(req.user)) return res.status(403).json({ error: 'You can only see your own attendance.' })
  // Not tracked (admin): no day of their own; the page shows the team instead.
  if (userId === req.user.id && !tracked(req.user.role)) return res.json({ date, today: today(), person: null, tracked: false })
  const [person] = await query(`SELECT id, name, role FROM users WHERE id = ? AND ${IN_TRACKED}`, [userId, ...TRACKED])
  if (!person) return res.status(404).json({ error: 'Attendance is not tracked for this person.' })
  const devices = await query(
    'SELECT name, platform, agent_version AS version, last_seen_at AS lastSeen FROM agent_devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC', [userId])
  res.json({ date, today: today(), person, devices, day: await dayFor(userId, date) })
})

// Everyone on the team (not clients) with their day totals and status right now.
r.get('/team', async (req, res) => {
  if (!canSeeTeam(req.user)) return res.status(403).json({ error: 'You do not have access to this.' })
  const date = dateParam.parse(req.query.date) || today()
  const people = await query(
    `SELECT u.id, u.name, u.role, COUNT(d.id) AS devices
       FROM users u LEFT JOIN agent_devices d ON d.user_id = u.id AND d.revoked_at IS NULL
      WHERE u.${IN_TRACKED} AND u.status = 'active' GROUP BY u.id ORDER BY u.name`, TRACKED)
  const rows = []
  for (const p of people) {
    const d = await dayFor(p.id, date)
    rows.push({ id: p.id, name: p.name, role: p.role, hasAgent: p.devices > 0,
      status: date === today() ? d.status : null, firstIn: d.firstIn, lastOut: d.lastOut, stillWorking: d.stillWorking,
      workMinutes: d.workMinutes, deskWorkMinutes: d.deskWorkMinutes, awayWorkMinutes: d.awayWorkMinutes, awayWork: d.awayWork,
      idleMinutes: d.idleMinutes, breakMinutes: d.breakMinutes, offlineMinutes: d.offlineMinutes, flags: d.flags,
      unproductiveMinutes: d.unproductiveMinutes, unproductive: d.unproductive, location: d.location,
      claudeMinutes: d.claudeMinutes, officeDayMinutes: d.officeDayMinutes, extension: d.extension })
  }
  res.json({ date, today: today(), people: rows })
})

// Month report: one row per person per day they worked, plus per-person totals.
// ?format=xlsx downloads it as Excel (flat rows, no merged cells).
r.get('/month', async (req, res) => {
  const month = z.string().regex(/^\d{4}-\d{2}$/, 'Pick a valid month.').optional().parse(req.query.month) || today().slice(0, 7)
  const lead = canSeeTeam(req.user)
  const people = lead
    ? await query(`SELECT id, name, role FROM users WHERE ${IN_TRACKED} AND status = 'active' ORDER BY name`, TRACKED)
    : tracked(req.user.role) ? [{ id: req.user.id, name: req.user.name, role: req.user.role }] : []

  const off = config.attendance.tzOffsetMinutes * 60 * 1000
  const clock = s => s ? new Date(Date.parse(s) + off).toISOString().slice(11, 16) : ''
  const rows = [], totals = [], away = [], unprod = []
  for (const p of people) {
    const days = await monthFor(p.id, month)
    for (const d of days) {
      rows.push({ userId: p.id, name: p.name, date: d.date, login: clock(d.firstIn), logout: clock(d.lastOut),
        workMinutes: d.workMinutes, deskWorkMinutes: d.deskWorkMinutes, awayWorkMinutes: d.awayWorkMinutes, awayWork: d.awayWork,
        idleMinutes: d.idleMinutes, breakMinutes: d.breakMinutes, offlineMinutes: d.offlineMinutes, checks: d.flagCount,
        unproductiveMinutes: d.unproductiveMinutes, unproductive: d.unproductive, location: d.location,
        inPlace: placeText(d.location?.in), outPlace: placeText(d.location?.out), inMap: mapLink(d.location?.in), outMap: mapLink(d.location?.out) })
      for (const u of d.unproductive) unprod.push({ name: p.name, date: d.date, label: u.label, minutes: u.minutes, during: u.duringWorkMinutes, how: u.how.join(', ') })
      for (const a of d.awayWork) away.push({ name: p.name, date: d.date, reason: a.reason, minutes: a.minutes })
    }
    const sum = k => days.reduce((s, d) => s + d[k], 0)
    totals.push({ userId: p.id, name: p.name, role: p.role, daysWorked: days.filter(d => d.workMinutes > 0).length,
      workMinutes: sum('workMinutes'), deskWorkMinutes: sum('deskWorkMinutes'), awayWorkMinutes: sum('awayWorkMinutes'),
      idleMinutes: sum('idleMinutes'), breakMinutes: sum('breakMinutes'), offlineMinutes: sum('offlineMinutes'), unproductiveMinutes: sum('unproductiveMinutes'),
      avgWorkMinutes: days.length ? Math.round(sum('workMinutes') / days.length) : 0 })
  }

  if (req.query.format !== 'xlsx') return res.json({ month, today: today(), people: totals, rows })

  const hours = m => Math.round(m / 6) / 10 // minutes -> hours with one decimal
  const wb = new ExcelJS.Workbook()
  const sheet = (name, cols, data) => {
    const ws = wb.addWorksheet(name)
    ws.columns = cols.map(([header, key, width]) => ({ header, key, width }))
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    data.forEach(d => ws.addRow(d))
  }
  sheet('Summary', [['Name', 'name', 24], ['Role', 'role', 14], ['Days worked', 'daysWorked', 13], ['Working hours (total)', 'work', 20],
    ['At desk hours', 'desk', 14], ['Away work hours', 'awayw', 16], ['Idle hours', 'idle', 12], ['Break hours', 'brk', 13], ['Offline hours', 'off', 14], ['Unproductive hours', 'unp', 18], ['Avg hours / day', 'avg', 16]],
  totals.map(t => ({ ...t, work: hours(t.workMinutes), desk: hours(t.deskWorkMinutes), awayw: hours(t.awayWorkMinutes),
    idle: hours(t.idleMinutes), brk: hours(t.breakMinutes), off: hours(t.offlineMinutes), unp: hours(t.unproductiveMinutes), avg: hours(t.avgWorkMinutes) })))
  sheet('Daily', [['Name', 'name', 24], ['Date', 'date', 12], ['Login', 'login', 9], ['Logout', 'logout', 9],
    ['Working hours (total)', 'work', 20], ['At desk hours', 'desk', 14], ['Away work hours', 'awayw', 16],
    ['Idle hours', 'idle', 12], ['Break hours', 'brk', 13], ['Offline hours', 'off', 14], ['Unproductive hours', 'unp', 18], ['Check-in place', 'inPlace', 26], ['Check-in map', 'inMap', 18], ['Check-out place', 'outPlace', 26], ['Check-out map', 'outMap', 18], ['Checks to review', 'checks', 16]],
  rows.map(d => ({ ...d, work: hours(d.workMinutes), desk: hours(d.deskWorkMinutes), awayw: hours(d.awayWorkMinutes),
    idle: hours(d.idleMinutes), brk: hours(d.breakMinutes), off: hours(d.offlineMinutes), unp: hours(d.unproductiveMinutes) })))
  // One row per away-work reason per day (Meeting, Client call, ...), so it can be filtered and summed.
  sheet('Away work', [['Name', 'name', 24], ['Date', 'date', 12], ['Reason', 'reason', 26], ['Hours', 'h', 9]],
    away.map(a => ({ ...a, h: hours(a.minutes) })))
  // One row per unproductive site/app per day; 'During work' = minutes while counted as work (e.g. Claude running).
  sheet('Unproductive', [['Name', 'name', 24], ['Date', 'date', 12], ['Site / app', 'label', 22], ['Minutes', 'minutes', 10],
    ['During work (min)', 'during', 17], ['Seen as', 'how', 26]], unprod)

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="Attendance_${month}.xlsx"`)
  await wb.xlsx.write(res)
  res.end()
})

export default r
