---
name: masters-work-modules
description: Leave, Project Repository, Reimbursements, Work Allotment — rules and decisions (26 Nov 2026)
metadata:
  type: project
---
Modules built 26 Nov 2026 (api route → web page). Permission keys in src/middleware/permissions.js MODULES.
- **Leave & Permission** (leaves.js / LeavePermission.jsx, key `leave`): 15 days/yr, Sat+Sun + active holidays skipped; no past dates; today's permission from now on (office tz). Edit = Team tab: approve / decline / cancel (pending or approved) with note. Own requests: cancel while pending.
- **Project Repository** (projectRepositories.js, key `project_repository`, Masters): project + https drive link + optional description; many links per project. Not granted to roles by default.
- **Reimbursements** (reimbursements.js, key `reimbursements`): title, optional description, amount, ≥1 bill (image/PDF, ≤10 files, 10 MB). Bills in private_uploads/ (served only via /api/reimbursements/files/:id to owner or editors). Status = payment status only (user chose to REPLACE approve/decline): unpaid (default) → pending / hold / paid by edit; cancelled. Owner cancels while unpaid.
- **Work Allotment** (workAllotments.js, key `work_allotment`): team (website | application) → project blocks (project, employees multi, works list as JSON). Same project not twice in one allotment; same employee across projects OK. Only TODAY's allotments can be edited/deleted (past locked, 409); page defaults to today with a date filter (?date=YYYY-MM-DD). view = own work (via employees.user_id), create = assign + see own-created, edit = all.
- **Ticketing System** (tickets.js / Tickets.jsx board+list, TicketDetail.jsx, lib/tickets.jsx; key `tickets`, migration 019): ticket_no = project-name initials + per-project seq (Travel Management App → TMA-1). Status open/in_progress/in_testing/completed; types bug/change/feature/improvement/task; priority low..critical; reported_by client/internal_testing/internal_team. Files (image/PDF/Excel, private_uploads/tickets) + links, optional. Timer per user: ticket_time_logs = stretches (start/resume open, pause/stop close), ticket_time_events = every click; one running timer per person; first start moves Open→In Progress; stop note + manual-log note also become comments (source time_note). State comes from DB so it survives logout. /tickets/timers/mine shows running/paused on list page. view = see/log/comment, create = raise, edit = any ticket + delete; assignees & creator may change status.
- Data scoping: everyone sees only their own records; edit/admin see team.

**Why:** user's requested behaviour. **How to apply:** keep these rules when changing these modules.
- 4-digit PIN login on employee creation: user said LEAVE IT TO THE COLLEAGUE (owns auth.jsx, Login.jsx, users, employees.access_role/user_id). Do not build.
- User wants low token use and this memory updated after every change. See [[time-tracker-resume-here]].
- **Times:** DB server clock is CET. db.js sets every session to UTC (time_zone '+00:00'), so NOW()/CURRENT_TIMESTAMP are UTC; migration 020 converted earlier rows of leave/repo/reimb/allotment/ticket tables. Web: lib/api.js toDate/fmtDate/localDay treat 'YYYY-MM-DD HH:MM:SS' as UTC → local; office-date SQL uses CONVERT_TZ with config tz offset (workAllotments.js LOCAL/TODAY).
