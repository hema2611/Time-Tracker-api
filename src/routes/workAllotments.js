// Work Allotment: assign works on projects to employees, grouped by team.
//   view   = see the work allotted to you
//   create = assign work (and see what you assigned)
//   edit   = see, change and remove everyone's allotments
import { Router } from 'express'
import { z } from 'zod'
import { query, transaction } from '../db.js'
import { requirePerm } from '../middleware/permissions.js'
import config from '../config.js'

// Stored times are UTC; "today" and dates are the office's (India by default).
const off = config.attendance.tzOffsetMinutes
const TZ = `${off < 0 ? '-' : '+'}${String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')}:${String(Math.abs(off) % 60).padStart(2, '0')}`
const LOCAL = col => `DATE(CONVERT_TZ(${col}, '+00:00', '${TZ}'))`
const TODAY = `DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${TZ}'))`

const r = Router()

export const TEAMS = { website: 'Website Team', application: 'Application Development' }

const item = z.object({
  project_id: z.coerce.number().int().positive({ message: 'Pick a project.' }),
  employee_ids: z.array(z.coerce.number().int().positive()).min(1, 'Pick at least one employee for each project.')
    .transform(a => [...new Set(a)]),
  works: z.array(z.string().trim().max(500)).transform(a => a.filter(Boolean))
    .refine(a => a.length > 0, 'Enter at least one work for each project.').refine(a => a.length <= 50, 'At most 50 works per project.'),
})
const body = z.object({
  team: z.enum(Object.keys(TEAMS), { errorMap: () => ({ message: 'Pick a team.' }) }),
  items: z.array(item).min(1, 'Add at least one project.').max(30),
}).superRefine((v, ctx) => {
  const seen = new Set()
  v.items.forEach((it, i) => {
    if (seen.has(it.project_id)) ctx.addIssue({ code: 'custom', path: ['items', i, 'project_id'], message: 'The same project is picked twice. Put all its employees and works in one block.' })
    seen.add(it.project_id)
  })
})

const fail = (status, message) => Object.assign(new Error(message), { status })
const perms = req => req.perms.modules.work_allotment || {}

// Projects and active employees to pick from.
r.get('/options', requirePerm('work_allotment', ['create', 'edit']), async (req, res) => {
  const [projects, employees] = await Promise.all([
    query("SELECT id, name, client_name FROM project_master WHERE status = 'active' ORDER BY name"),
    query("SELECT id, name, emp_no, photo FROM employees WHERE status NOT IN ('resigned','terminated') ORDER BY name"),
  ])
  res.json({ teams: TEAMS, projects, employees })
})

// List. Everyone sees work allotted to them; creators also see what they assigned; editors see all.
// scope=mine limits to the signed-in user's own work even for editors.
r.get('/', requirePerm('work_allotment', 'view'), async (req, res) => {
  const p = perms(req)
  const [me] = await query('SELECT id FROM employees WHERE user_id = ? LIMIT 1', [req.user.id])
  const myEmp = me?.id || 0
  const mine = req.query.scope === 'mine' || (!p.edit && !p.create)

  const where = [], params = []
  if (mine) {
    where.push('EXISTS (SELECT 1 FROM work_allotment_items i2 JOIN work_allotment_members m2 ON m2.item_id = i2.id WHERE i2.allotment_id = a.id AND m2.employee_id = ?)')
    params.push(myEmp)
  } else if (!p.edit) {
    where.push('(a.created_by = ? OR EXISTS (SELECT 1 FROM work_allotment_items i2 JOIN work_allotment_members m2 ON m2.item_id = i2.id WHERE i2.allotment_id = a.id AND m2.employee_id = ?))')
    params.push(req.user.id, myEmp)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '')) { where.push(`${LOCAL('a.created_at')} = ?`); params.push(req.query.date) }
  if (TEAMS[req.query.team]) { where.push('a.team = ?'); params.push(req.query.team) }

  const allotments = await query(
    `SELECT a.id, a.team, a.created_by, a.created_at, a.updated_at, u.name AS created_by_name, ${LOCAL('a.created_at')} = ${TODAY} AS is_today
       FROM work_allotments a LEFT JOIN users u ON u.id = a.created_by
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY a.created_at DESC, a.id DESC`, params)
  if (!allotments.length) return res.json({ teams: TEAMS, allotments: [] })

  const ids = allotments.map(a => a.id)
  const items = await query(
    `SELECT i.id, i.allotment_id, i.project_id, i.works, p.name AS project_name, p.client_name
       FROM work_allotment_items i JOIN project_master p ON p.id = i.project_id
      WHERE i.allotment_id IN (${ids.map(() => '?').join(',')}) ORDER BY i.id`, ids)
  const members = items.length ? await query(
    `SELECT m.item_id, e.id, e.name, e.emp_no, e.photo FROM work_allotment_members m JOIN employees e ON e.id = m.employee_id
      WHERE m.item_id IN (${items.map(() => '?').join(',')}) ORDER BY e.name`, items.map(i => i.id)) : []

  const memBy = new Map()
  for (const m of members) memBy.set(m.item_id, [...(memBy.get(m.item_id) || []), { id: m.id, name: m.name, emp_no: m.emp_no, photo: m.photo }])
  const itemBy = new Map()
  for (const i of items) {
    let works = []
    try { works = JSON.parse(i.works) } catch { works = [i.works] }
    itemBy.set(i.allotment_id, [...(itemBy.get(i.allotment_id) || []), {
      id: i.id, project_id: i.project_id, project_name: i.project_name, client_name: i.client_name, works, employees: memBy.get(i.id) || [],
    }])
  }
  res.json({
    teams: TEAMS,
    allotments: allotments.map(a => ({
      ...a, items: itemBy.get(a.id) || [],
      is_today: !!a.is_today,
      can_edit: !!a.is_today && (!!p.edit || (!!p.create && a.created_by === req.user.id)),
    })),
  })
})

async function save(tx, allotmentId, b) {
  const pids = b.items.map(i => i.project_id)
  const found = await tx.query(`SELECT id FROM project_master WHERE id IN (${pids.map(() => '?').join(',')})`, pids)
  if (found.length !== new Set(pids).size) throw fail(400, 'One of the projects no longer exists.')
  const eids = [...new Set(b.items.flatMap(i => i.employee_ids))]
  const emps = await tx.query(`SELECT id FROM employees WHERE id IN (${eids.map(() => '?').join(',')})`, eids)
  if (emps.length !== eids.length) throw fail(400, 'One of the employees no longer exists.')

  await tx.query('DELETE FROM work_allotment_items WHERE allotment_id = ?', [allotmentId]) // members go with them (cascade)
  for (const it of b.items) {
    const { insertId } = await tx.query('INSERT INTO work_allotment_items (allotment_id, project_id, works) VALUES (?, ?, ?)',
      [allotmentId, it.project_id, JSON.stringify(it.works)])
    for (const e of it.employee_ids) await tx.query('INSERT INTO work_allotment_members (item_id, employee_id) VALUES (?, ?)', [insertId, e])
  }
}

r.post('/', requirePerm('work_allotment', 'create'), async (req, res) => {
  const b = body.parse(req.body)
  const id = await transaction(async tx => {
    const { insertId } = await tx.query('INSERT INTO work_allotments (team, created_by) VALUES (?, ?)', [b.team, req.user.id])
    await save(tx, insertId, b)
    return insertId
  })
  res.status(201).json({ id })
})

// Change: editors any; creators their own. Only today's allotments; past days are locked.
async function assertCanChange(req, id) {
  const [a] = await query(`SELECT id, created_by, ${LOCAL('created_at')} = ${TODAY} AS is_today FROM work_allotments WHERE id = ?`, [id])
  const p = perms(req)
  if (!a || !(p.edit || (p.create && a.created_by === req.user.id))) throw fail(404, 'Allotment not found.')
  if (!a.is_today) throw fail(409, "Only today's allotments can be edited or removed. Past days are locked.")
  return a
}

r.put('/:id', requirePerm('work_allotment', ['create', 'edit']), async (req, res) => {
  const b = body.parse(req.body)
  const a = await assertCanChange(req, req.params.id)
  await transaction(async tx => {
    await tx.query('UPDATE work_allotments SET team = ? WHERE id = ?', [b.team, a.id])
    await save(tx, a.id, b)
  })
  res.json({ ok: true })
})

r.delete('/:id', requirePerm('work_allotment', ['create', 'edit']), async (req, res) => {
  const a = await assertCanChange(req, req.params.id)
  await query('DELETE FROM work_allotments WHERE id = ?', [a.id])
  res.json({ ok: true })
})

export default r
