// Turns a person's raw agent events into a day: work / break / offline pieces and totals.
// Nothing is stored; the day is worked out fresh from the events every time.
import config from './config.js'
import { query } from './db.js'

const { tzOffsetMinutes, minBreakMinutes, gapMinutes, lateMinutes } = config.attendance
const unproductiveLimitMinutes = config.attendance.unproductiveLimitMinutes
// Office hours (9 AM – 6 PM, 9 hours) and how long the agent may be silent in them before it is flagged.
const officeStartHour = +(process.env.OFFICE_START_HOUR || 9)
const officeEndHour = +(process.env.OFFICE_END_HOUR || 18)
const silentMinutes = +(process.env.AGENT_SILENT_MINUTES || 15)
const MIN = 60 * 1000
const toMs = s => Date.parse(s.replace(' ', 'T') + 'Z') // DB times are UTC
const iso = ms => new Date(ms).toISOString()

// Office day "YYYY-MM-DD" -> [start, end) in UTC milliseconds.
export function dayBounds(date) {
  const start = Date.parse(`${date}T00:00:00Z`) - tzOffsetMinutes * MIN
  return [start, start + 24 * 60 * MIN]
}
export const today = () => new Date(Date.now() + tzOffsetMinutes * MIN).toISOString().slice(0, 10)

const AWAY = { lock: 'Screen locked', suspend: 'Sleep', idle_start: 'Idle' }

// Answers to the agent's "what was this break?" question. work: true = it was work away from the desk.
export const BREAK_REASONS = {
  lunch: { label: 'Lunch' }, tea: { label: 'Tea / coffee' }, personal: { label: 'Personal' },
  health: { label: 'Health / medical' }, prayer: { label: 'Prayer' },
  meeting: { label: 'Meeting', work: true }, client_call: { label: 'Client call', work: true },
  training: { label: 'Training / learning', work: true }, work_away: { label: 'Work away from desk', work: true },
  pc_issue: { label: 'PC / power / internet problem' },
  other: { label: 'Other' }, // the person types the reason; counted as a break
}
const OFF = { shutdown: 'Shut down', agent_quit: 'Agent closed' }

// events: [{ type, at (ms), idleSince? (ms) }] sorted by time, all of the person's computers together.
export function buildDay(events, { now = Date.now(), dayEnd } = {}) {
  const pieces = []
  let state = null, since = null, reason = '', lastAt = null

  const close = at => { if (state && at > since) pieces.push({ kind: state, start: since, end: at, reason }) }
  // Already away? Stay in the same piece: going idle while the screen is locked is still the same break.
  const go = (next, at, why = '') => { if (state === next && (reason === why || next !== 'work')) return; close(at); state = next; since = at; reason = why }

  const answers = []
  for (const e of events) {
    if (e.type === 'break_reason') { answers.push(e); continue } // applied after the pieces are built
    if (e.type === 'flagged_use' || e.type === 'location') continue // reported apart; they never change work/idle/break
    // No sign of life for too long while "working": the agent was not running (or the PC was off).
    if (state === 'work' && lastAt !== null && e.at - lastAt > gapMinutes * MIN) {
      go('offline', lastAt + MIN, 'Agent not running')
    }
    if (AWAY[e.type]) {
      // Idle is noticed late; the break really started when input stopped.
      const at = e.type === 'idle_start' && e.idleSince && state === 'work' && e.idleSince > (since ?? 0) ? e.idleSince : e.at
      go('break', at, AWAY[e.type])
    } else if (OFF[e.type]) {
      go('offline', e.at, OFF[e.type])
    } else if (e.type === 'heartbeat') {
      // A heartbeat while away keeps the break; after a gap it means work again.
      if (state === null || state === 'offline') go('work', e.at)
    } else {
      go('work', e.at) // agent_start, unlock, resume, idle_end
    }
    lastAt = e.at
  }

  // Still going: extend to now if the agent was heard from recently, else end at the last sign of life.
  const live = lastAt !== null && now - lastAt <= gapMinutes * MIN
  if (state) close(live ? Math.min(now, dayEnd ?? now) : (state === 'work' ? lastAt + MIN : lastAt))

  // The person's own answer wins: a break (or sleep / PC off) inside the answered time gets that reason,
  // and "Meeting" / "Work away from desk" turn it into work.
  for (const a of answers) {
    const r = BREAK_REASONS[a.reason]
    if (!r || !a.from || !a.to) continue
    for (const p of pieces) {
      if (p.kind === 'work' || p.start < a.from - MIN || p.end > a.to + MIN) continue
      p.reason = a.reason === 'other' && a.note ? `Other: ${String(a.note).slice(0, 200)}` : r.label
      p.answered = true
      if (r.work) p.kind = 'work'
    }
  }

  // Short breaks count as work; then join touching pieces of the same kind.
  for (const p of pieces) if (p.kind === 'break' && !p.answered && p.end - p.start < minBreakMinutes * MIN) { p.kind = 'work'; p.reason = '' }
  // Idle (PC on and unlocked, no activity) is its own category, apart from real breaks
  // (locked, sleep, or answered Lunch / Tea / ...). Once the person gives a reason, it is that reason instead.
  for (const p of pieces) if (p.kind === 'break' && !p.answered && p.reason === AWAY.idle_start) p.kind = 'idle'
  const merged = []
  for (const p of pieces) {
    const last = merged[merged.length - 1]
    if (last && last.kind === p.kind && (last.reason || '') === (p.reason || '') && last.end >= p.start) last.end = Math.max(last.end, p.end)
    else merged.push({ ...p })
  }
  while (merged.length && merged[merged.length - 1].kind !== 'work') merged.pop() // nothing after the last work counts

  const work = merged.filter(p => p.kind === 'work')
  const sum = kind => Math.round(merged.filter(p => p.kind === kind).reduce((s, p) => s + p.end - p.start, 0) / MIN)
  // Work away from the desk (the person answered Meeting, Client call, Training, Work away): counted as work,
  // but always shown apart from time at the desk.
  const awayPieces = work.filter(p => p.reason)
  const awayBy = {}
  for (const p of awayPieces) awayBy[p.reason] = (awayBy[p.reason] || 0) + (p.end - p.start) / MIN
  const awayWorkMinutes = Math.round(Object.values(awayBy).reduce((s, m) => s + m, 0))
  const nowState = !live ? 'offline' : state === 'work' ? 'working' : state === 'break' ? (reason === AWAY.idle_start ? 'idle' : 'on_break') : 'offline'

  // Unproductive sites/apps (YouTube, games, ...): one report per thing per minute from the agent.
  // Kept as work when Claude was working (as agreed), but always listed, including how much was during work.
  const inWork = t => merged.some(p => p.kind === 'work' && p.start <= t && p.end > t)
  const useBy = {}
  const usedMinutes = new Set()
  for (const e of events) {
    if (e.type !== 'flagged_use' || !e.use?.label) continue
    const u = (useBy[e.use.label] ||= { label: e.use.label, kind: e.use.kind, secs: 0, workSecs: 0, how: new Set() })
    const s = Math.min(60, Math.max(0, e.use.secs || 60))
    u.secs += s
    if (inWork(e.at)) u.workSecs += s
    if (e.use.how) u.how.add(e.use.how)
    usedMinutes.add(Math.floor(e.at / MIN))
  }
  const unproductive = Object.values(useBy)
    .map(u => ({ label: u.label, kind: u.kind, minutes: Math.round(u.secs / 60), duringWorkMinutes: Math.round(u.workSecs / 60), how: [...u.how] }))
    .filter(u => u.minutes > 0).sort((a, b) => b.minutes - a.minutes)

  return {
    unproductive,
    unproductiveMinutes: usedMinutes.size, // minutes with at least one unproductive site/app (not double-counted)
    firstIn: work.length ? iso(work[0].start) : null,
    lastOut: work.length ? iso(work[work.length - 1].end) : null,
    stillWorking: live && state === 'work',
    status: nowState,
    workMinutes: sum('work'),
    deskWorkMinutes: Math.max(0, sum('work') - awayWorkMinutes),
    awayWorkMinutes,
    awayWork: Object.entries(awayBy).map(([reason, m]) => ({ reason, minutes: Math.round(m) })),
    idleMinutes: sum('idle'),
    breakMinutes: sum('break'),
    offlineMinutes: sum('offline'),
    // kind 'away_work' = work away from the desk (answered reason), so it is drawn and listed on its own.
    pieces: merged.map(p => ({ kind: p.kind === 'work' && p.reason ? 'away_work' : p.kind, start: iso(p.start), end: iso(p.end), reason: p.reason || undefined })),
  }
}

const dbTime = ms => iso(ms).slice(0, 23).replace('T', ' ')
const officeDate = ms => new Date(ms + tzOffsetMinutes * MIN).toISOString().slice(0, 10)

// A person's events between two UTC times, oldest first.
async function eventsBetween(userId, start, end) {
  const rows = await query(
    `SELECT type, occurred_at, received_at, ip, device_id, detail
       FROM activity_events WHERE user_id = ? AND occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at, id`,
    [userId, dbTime(start), dbTime(end)])
  const ms = s => (s ? Date.parse(s) || null : null)
  return rows.map(r => {
    const d = (typeof r.detail === 'string' ? JSON.parse(r.detail) : r.detail) || {}
    return { type: r.type, at: toMs(r.occurred_at), receivedAt: r.received_at ? toMs(r.received_at) : null, ip: r.ip, device: r.device_id,
      idleSince: ms(d.idleSince), reason: d.reason, note: d.note, from: ms(d.from), to: ms(d.to),
      signals: 'idle' in d ? { idle: d.idle, ai: !!d.ai, up: d.up, browser: d.browser, ext: d.ext } : null,
      use: r.type === 'flagged_use' ? { label: d.label, kind: d.kind, how: d.how, secs: d.secs } : null,
      loc: r.type === 'location' ? { wifi: d.wifi, lat: d.lat, lon: d.lon, acc: d.acc } : null }
  })
}

// One office day for one person, with the checks the manager should look at.
export async function dayFor(userId, date) {
  const [start, end] = dayBounds(date)
  const events = await eventsBetween(userId, start, end)
  const day = buildDay(events, { dayEnd: end })
  day.location = locationOf(events, day, await officeNetworks())
  day.flags = await dayFlags(userId, events, day, start, end)
  return day
}

// ---- Check-in / check-out location (only what was available: network, Wi-Fi name, exact place) ----
let officeCache = { at: 0, list: [] }
export async function officeNetworks() {
  if (Date.now() - officeCache.at > 60 * 1000) officeCache = { at: Date.now(), list: await query('SELECT kind, value, label FROM office_networks') }
  return officeCache.list
}
const normIp = ip => String(ip || '').replace(/^::ffff:/, '')
function placeOf(ip, wifi, offices) {
  const o = offices.find(n => (n.kind === 'ip' && normIp(ip) === n.value) || (n.kind === 'wifi' && wifi && wifi.toLowerCase() === n.value.toLowerCase()))
  if (o) return { place: 'Office', label: o.label }
  return { place: offices.length ? 'Remote' : null, label: null } // without an office list there is nothing to compare with
}
export function locationOf(events, day, offices) {
  if (!day.firstIn) return null
  const inAt = Date.parse(day.firstIn), outAt = Date.parse(day.lastOut)
  const locs = events.filter(e => e.type === 'location')
  const withIp = events.filter(e => e.ip)
  const nearest = (list, t, first) => (first ? list.find(e => e.at >= t - 5 * MIN) : [...list].reverse().find(e => e.at <= t + 5 * MIN)) || (first ? list[0] : list[list.length - 1])
  const point = (t, first) => {
    const l = locs.length ? nearest(locs, t, first) : null
    const n = withIp.length ? nearest(withIp, t, first) : null
    if (!l && !n) return null
    const ip = n?.ip || l?.ip || null, wifi = l?.loc?.wifi || null
    return { at: iso(t), ip: normIp(ip) || null, wifi, ...(l?.loc?.lat !== undefined ? { lat: l.loc.lat, lon: l.loc.lon, acc: l.loc.acc } : {}), ...placeOf(ip, wifi, offices) }
  }
  return { in: point(inAt, true), out: point(outAt, false) }
}

// ---- Checks against forged or scripted activity (shown to the manager, nothing is blocked) ----
// Each check returns { code, text }. They are hints to look closer, not proof.
export function patternFlags(events, day) {
  const flags = []
  const real = events.filter(e => e.type !== 'break_reason')

  // Sent late: events that reached the server long after they happened (offline, or edited before sending).
  const late = real.filter(e => e.receivedAt && e.receivedAt - e.at > lateMinutes * MIN)
  if (late.length) flags.push({ code: 'sent_late', text: `${late.length} event(s) reached the server more than ${lateMinutes} min after they happened` })

  // PC clock: an event "happened" clearly after it arrived = the PC clock is ahead.
  const ahead = real.filter(e => e.receivedAt && e.at - e.receivedAt > 2 * MIN)
  if (ahead.length) flags.push({ code: 'clock', text: 'The PC clock looks wrong (event times are ahead of the server)' })

  // Too perfect: 4+ hours of work with no lock, idle, sleep or break at all, and input never paused 30 s.
  const pauses = real.filter(e => ['lock', 'unlock', 'idle_start', 'idle_end', 'suspend', 'resume'].includes(e.type)).length
  const beats = real.filter(e => e.type === 'heartbeat')
  const withSignals = beats.filter(e => e.signals)
  if (day.workMinutes >= 240 && !pauses && withSignals.length >= 60 && withSignals.every(e => e.signals.idle < 30)) {
    flags.push({ code: 'too_perfect', text: 'Constant activity for 4+ hours: no lock, no idle, input never paused for 30 seconds (possible mouse jiggler or script)' })
  }
  // Signals missing: an up-to-date agent always sends them; heartbeats without them may come from a script.
  if (withSignals.length && beats.length - withSignals.length > 10) {
    flags.push({ code: 'no_signals', text: `${beats.length - withSignals.length} heartbeats came without the usual activity details` })
  }
  // Two computers reporting for the same person in the same minutes (agent on a second PC or a VM).
  const byMinute = {}
  for (const e of beats) if (e.device) (byMinute[Math.floor(e.at / MIN)] ||= new Set()).add(e.device)
  const both = Object.values(byMinute).filter(s => s.size > 1).length
  if (both >= 5) flags.push({ code: 'two_pcs', text: `Two computers were active for this person at the same time for ${both} min` })

  // Much of the day answered as Meeting / Client call / Work away: worth checking against calendars.
  if (day.awayWorkMinutes >= 120 || (day.workMinutes >= 120 && day.awayWorkMinutes / day.workMinutes >= 0.4)) {
    const by = (day.awayWork || []).map(a => `${a.reason} ${a.minutes}m`).join(', ')
    flags.push({ code: 'away_heavy', text: `${day.awayWorkMinutes} min of the day answered as away work (${by})` })
  }

  // Unproductive sites/apps over the daily limit.
  if (day.unproductiveMinutes >= unproductiveLimitMinutes) {
    const top = day.unproductive.slice(0, 3).map(u => `${u.label} ${u.minutes}m`).join(', ')
    flags.push({ code: 'unproductive', text: `${day.unproductiveMinutes} min on unproductive sites/apps (${top})` })
  }
  // Browser extension: a browser in front but no report from the extension = removed or turned off.
  const noExt = withSignals.filter(e => e.signals.browser && e.signals.ext === false).length
  if (noExt >= 10) flags.push({ code: 'no_extension', text: `Browser used ${noExt} min without the tracker extension (removed or turned off?)` })
  const other = withSignals.filter(e => e.signals.browser === 'other').length
  if (other >= 10) flags.push({ code: 'other_browser', text: `${other} min in a browser without the tracker extension (not Chrome / Edge)` })

  return { flags, aiBeats: withSignals.filter(e => e.signals.ai).length, hasSignals: withSignals.length > 0 }
}

async function dayFlags(userId, events, day, start, end) {
  if (!events.length) return []
  const { flags, aiBeats, hasSignals } = patternFlags(events, day)

  // Network: addresses used today vs the last 14 days.
  const today = [...new Set(events.map(e => e.ip).filter(Boolean))]
  if (today.length > 1) flags.push({ code: 'many_networks', text: `Messages came from ${today.length} different networks today (${today.join(', ')})` })
  if (today.length) {
    const before = await query(
      'SELECT DISTINCT ip FROM activity_events WHERE user_id = ? AND occurred_at >= ? AND occurred_at < ? AND ip IS NOT NULL',
      [userId, dbTime(start - 14 * 24 * 60 * MIN), dbTime(start)])
    const known = new Set(before.map(r => r.ip))
    const fresh = today.filter(ip => !known.has(ip))
    if (before.length && fresh.length) flags.push({ code: 'new_network', text: `New network not seen in the last 14 days: ${fresh.join(', ')}` })
  }

  // Agent silent during office hours today (ended, uninstalled, blocked, or the PC switched off) after the person started.
  const now = Date.now()
  if (now >= start && now < end && day.firstIn) {
    const hour = new Date(now + tzOffsetMinutes * MIN).getUTCHours()
    const lastAt = Math.max(...events.map(e => e.at))
    if (hour >= officeStartHour && hour < officeEndHour && now - lastAt > silentMinutes * MIN) {
      const since = new Date(lastAt + tzOffsetMinutes * MIN).toISOString().slice(11, 16)
      flags.push({ code: 'silent', text: `Agent silent since ${since} (no messages for ${Math.round((now - lastAt) / MIN)} min during office hours)` })
    }
  }

  // A computer signed in for this person for the first time today, while they already had another one.
  const pcs = await query('SELECT name, created_at >= ? AS fresh FROM agent_devices WHERE user_id = ? AND revoked_at IS NULL AND created_at < ?',
    [dbTime(start), userId, dbTime(end)])
  const fresh = pcs.filter(p => p.fresh)
  if (fresh.length && pcs.length > fresh.length) {
    flags.push({ code: 'new_pc', text: `New computer signed in today: ${[...new Set(fresh.map(p => p.name))].join(', ')}` })
  }

  // Real work: long hours but nothing done in the tracker and (when known) no Claude activity.
  if (day.workMinutes >= 240) {
    const [{ n }] = await query(
      `SELECT COUNT(*) AS n FROM audit_log WHERE user_id = ? AND action NOT IN ('login', 'login_failed')
         AND CONVERT_TZ(created_at, 'SYSTEM', '+00:00') >= ? AND CONVERT_TZ(created_at, 'SYSTEM', '+00:00') < ?`,
      [userId, dbTime(start), dbTime(end)])
    if (!n && (!hasSignals || !aiBeats)) {
      flags.push({ code: 'no_output', text: `${Math.round(day.workMinutes / 60)}+ hours worked but no activity in the tracker${hasSignals ? ' and no Claude use' : ''}` })
    }
  }
  return flags
}

// Every day of a month ("YYYY-MM") for one person, read in one query. Days with no activity are left out.
export async function monthFor(userId, month) {
  const [start] = dayBounds(`${month}-01`)
  const [y, m] = month.split('-').map(Number)
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`
  const [end] = dayBounds(next)
  const byDay = {}
  for (const e of await eventsBetween(userId, start, end)) (byDay[officeDate(e.at)] ||= []).push(e)
  const offices = await officeNetworks()
  return Object.keys(byDay).sort().map(date => {
    const day = buildDay(byDay[date], { dayEnd: dayBounds(date)[1] })
    day.location = locationOf(byDay[date], day, offices)
    return { date, ...day, flagCount: patternFlags(byDay[date], day).flags.length } // quick checks only (no extra queries)
  })
}
