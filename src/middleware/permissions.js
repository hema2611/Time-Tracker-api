// Role-based permissions: which screens (modules) a login may view, create in, or edit.
import { query } from '../db.js'

// Every screen that can be granted, grouped as on the permissions page.
// Add a row here when a new screen is built (and give it a menu item with the same key on the web side).
export const MODULES = [
  { group: 'Masters', key: 'employees', label: 'Employees' },
  { group: 'Masters', key: 'roles', label: 'Roles' },
  { group: 'Masters', key: 'projects', label: 'Projects' },
  { group: 'Masters', key: 'project_repository', label: 'Project Repository' },
  { group: 'Events', key: 'holiday_calendar', label: 'Holiday Calendar' },
  { group: 'Events', key: 'events', label: 'Events' },
  { group: 'Work', key: 'attendance', label: 'Attendance' },
  // Leave & Permission: view = own requests, create = apply, edit = approve / reject others.
  { group: 'Work', key: 'leave', label: 'Leave & Permission' },
  // Reimbursements: view = own claims, create = submit, edit = see everyone's and set the payment status.
  { group: 'Work', key: 'reimbursements', label: 'Reimbursements' },
  // Work Allotment: view = work allotted to you, create = assign work, edit = see / change everyone's.
  { group: 'Work', key: 'work_allotment', label: 'Work Allotment' },
  // Ticketing: view = see, log time, comment; create = raise; edit = change any ticket, status, delete.
  { group: 'Work', key: 'tickets', label: 'Ticketing System' },
]
export const MODULE_KEYS = MODULES.map(m => m.key)

// A new role starts with these (view only); an admin can change them afterwards.
export const DEFAULT_VIEW = ['holiday_calendar', 'events', 'attendance', 'leave', 'reimbursements', 'work_allotment', 'tickets']
// ...and may also create in these (apply for leave, submit a claim).
export const DEFAULT_CREATE = ['leave', 'reimbursements', 'tickets']

const none = () => ({ view: false, create: false, edit: false })
const full = () => ({ view: true, create: true, edit: true })

// Admins get everything. Everyone else gets what their employee record's role allows.
// No linked employee, an inactive role, or a resigned/terminated employee means no access.
export async function permissionsFor(user) {
  if (user.role === 'admin') {
    return { admin: true, role: null, modules: Object.fromEntries(MODULE_KEYS.map(k => [k, full()])) }
  }
  const rows = await query(
    `SELECT r.id AS role_id, r.name AS role_name, rp.module_key, rp.can_view, rp.can_create, rp.can_edit
       FROM employees e
       JOIN roles r ON r.id = e.role_id AND r.status = 'active'
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
      WHERE e.user_id = ? AND e.status NOT IN ('resigned', 'terminated')`,
    [user.id],
  )
  const modules = Object.fromEntries(MODULE_KEYS.map(k => [k, none()]))
  for (const r of rows) {
    const m = modules[r.module_key]
    if (!m) continue
    m.create ||= !!r.can_create
    m.edit ||= !!r.can_edit
    m.view ||= !!r.can_view || m.create || m.edit // creating or editing implies seeing the list
  }
  return { admin: false, role: rows[0] ? { id: rows[0].role_id, name: rows[0].role_name } : null, modules }
}

const ACTION_FOR = { GET: 'view', HEAD: 'view', POST: 'create', PUT: 'edit', PATCH: 'edit', DELETE: 'edit' }

// Use after requireAuth. Without an explicit action it follows the HTTP method
// (GET = view, POST = create, PUT/DELETE = edit). `action` may also be a list: any one is enough.
export const requirePerm = (moduleKey, action) => async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' })
  req.perms ||= await permissionsFor(req.user)
  const acts = [].concat(action || ACTION_FOR[req.method] || 'edit')
  if (acts.some(a => req.perms.modules[moduleKey]?.[a])) return next()
  res.status(403).json({ error: 'You do not have permission to do this.' })
}

// Changing permissions is admin-only, so nobody can grant themselves more access.
export const requireAdmin = (req, res, next) =>
  req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Only an admin can change permissions.' })
