---
name: time-tracker-resume-here
description: RESUME POINT for the Time Tracker (desktop agent + attendance) work — read first in any tracker session
metadata:
  type: project
---

**Resume point — 2026-11-26 (updated midday).** UPDATE: agent 0.3.0 INSTALLED (restart task 1 min verified). api+web: 25–26 Nov work committed, colleague's commits merged (masters/events; their removal of projects/CRs/AI/timelines/users accepted; login gate + Attendance + sign-out kept), PUSHED. Colleague leaked real DB password/JWT/Gemini key in .env.example on GitHub → user told to rotate. Web restyled with [[tracker-theme]] (dark+light), attendance page now shows 9h ring / Claude minutes / extension state / agent version; server stores agent events in one multi-row insert (old per-row insert timed out the agent → 'offline' + resend loop). Office Wi-Fi ImagiNET Hub 2 = Chennai office added. All committed + pushed (api aeaba9c, web 44c0270). Steps 1, 3 and api/web part of 4 below are DONE. Extension still not loaded (page shows 'Extension off'). Details of rules/built/admin-last list: [[time-tracker-agent-state]]. Don't reinstall per change: [[tracker-agent-no-reinstall]].

Folders: Time-Tracker-api, Time-Tracker-web, Time-Tracker-agent (all under C:\Users\Hp\Documents\GitHub). Session folder is the OLD project-tracker-api (user declined trusting Time-Tracker-api) → always use absolute paths. Test run: API port 4001 (`$env:PORT='4001'; npm --prefix ...Time-Tracker-api run dev`), web 5181 (`$env:WEB_PORT='5181'; $env:TRACKER_API='http://localhost:4001'; npm --prefix ...Time-Tracker-web run dev`). Both die on PC restart — start them again. Dev DB track_project on 161.97.171.209 only (migrations up to 011 applied).

**Installed on user's PC: agent 0.2.2** (signed in as hemA / hemalatha@imaginetventures.com, Admin role). Restarts via scheduled task (5 min in 0.2.2).

**Built in code but NOT installed yet (next install, version 0.3.0):**
logo inside tool (orb only app icon) · 5 colours + Idle split + 9-h ring · unproductive tracking (watch.js app-in-front via PowerShell, usage.js, local link 127.0.0.1:47821) · location (location.js, locask.html one-time prompt) · Claude counts only if a Claude program runs · restart task every 1 min (build/installer.nsh) · strict question now covers the taskbar (setFullScreen+setKiosk after show, re-applied by guard).
**Browser extension** in Time-Tracker-agent/extension (MV3) — never loaded yet; test = chrome://extensions → Developer mode → Load unpacked.
Server + web changes are live on the test servers (no install needed).

**Last thing the user found (2026-11-25/26):** full-screen break question left the Windows taskbar visible → they opened Task Manager from taskbar thumbnails and ended the agent. Fix written (above), untested — test after next install: lock 15+ min (or BREAK_ASK_SECONDS test build), confirm taskbar is covered.

**Next steps, in order:**
1. User says install → bump to 0.3.0, `npx electron-builder --win`, stop agent, `/S` install, start, verify (no page errors via --enable-logging; restart task 1 min; question covers taskbar).
2. Load extension unpacked in Chrome; test YouTube/incognito/split screen → Attendance Unproductive box.
3. Add "ImagiNET Hub 2" as office Wi-Fi in Attendance → Site rules → Office networks.
4. Commit + push all three repos (agent needs a new GitHub repo Time-Tracker-agent; api/web remotes = hema2611/Time-Tracker-api / -web). NOTHING from 25–26 Nov is committed.
5. Bypass Excel (Time-Tracker-api/docs/Agent_Bypass_Review.xlsx, generator script in old scratchpad) — row 11 + statuses need refresh after the fixes.
6. Then the ADMIN/IT list (kept last) in [[time-tracker-agent-state]].

**Open / undecided (not started):** phone notifications for tracker alerts (user asked about "notification mirroring"; I suggested tracker→phone web push; no answer yet) · "answer missed breaks later" on the web (suggested only) · remove the 2 old duplicate device rows for hemA (offered) · web mobile-layout fixes (paused 24 Nov) · write the Attendance/agent module into project-tracker docs/OUTLINE.md (offered, not done) · software mouse-jiggler exact detection (needs signed native helper; only "too perfect" flag today) · Mac code untested.

**Why:** user asked to save exactly where we stopped so the next session can continue.
**How to apply:** start any tracker session by reading this; confirm servers are running; ask before installing.

**2026-11-27 afternoon — pulled colleague's commits (api 494a498, web 7cfa873)**: Tickets, Leave & Permission, Reimbursements, Work Allotment, Project Repository, role permissions (menu shows per permission), collapsible sidebar (Ctrl+B), db sessions in UTC (our attendance unaffected: it already writes UTC_TIMESTAMP). Migrations 012–020 already on dev DB. Merged into local working copies, NOT committed. Conflicts resolved: api employees.js (kept our employee-login + their requirePerm on every route), MEMORY.md (both lines); web App.jsx (their routes + our home redirect), ui.jsx (imports), Employees.jsx (both Email + Login columns), Layout.jsx (their version + our DESIGN.md styling: tinted active item, 230px, max-w 1180). Backup stashes "pre-merge local work 2026-11-27" kept in api and web (drop once user confirms). Their pages still use old slate/indigo names (render in new theme via aliases) — UI debt listed to user. DESIGN.md tokens + components/ui + Login + Attendance + agent greet popup redesign done today, uncommitted; agent not rebuilt.

**2026-11-27 — Forgot password by email (built + tested, uncommitted):** web: Sign-in → "Forgot password?" → "Reset your password" (email) → "Check your email"; link /reset-password?token= → "Choose a new password" → "Password changed". API: POST /auth/forgot (same answer for any email; 5/hour per IP; 1 link per 2 min per user; older links voided), GET /auth/reset/:token, POST /auth/reset (30 min, single use); migration 021 (password_resets + users.password_changed_at, applied on dev DB); requireAuth refuses sessions older than password_changed_at (reset AND change-password sign out other devices). src/mailer.js uses nodemailer; NO SMTP yet → dev prints the mail to API console; production throws without SMTP. Needs company mailbox (SMTP_* in .env, see .env.example). dev@test.local test password restored after testing.

**2026-11-27 — Task assignment module: NOT built.** User asked for one, then said "if exists leave it": Work Allotment (daily plan) + Tickets (type "task", assignees, status, timers) already cover it. Don't start a separate tasks module unless the user asks again.

**2026-11-27 — "+ Add new" in master dropdowns (built + tested, uncommitted):** Dropdown/MultiSelect take onAddNew/addLabel; components/QuickAdd.jsx useQuickAdd() opens the real ProjectForm/RoleForm/EmployeeForm (exported from their pages, onSaved(id)) in a portal on top and selects the new record; only if /permissions/me allows create. Wired: Work Allotment (project, employees), Raise ticket (project, assignees), Edit ticket (assignees), Events (participants), Project Repository (project), Employee form (role). Not done: event types (config is read-only, no master), Team (fixed list). Rule added to DESIGN.md §5. Tested: quick-added project selected in Allot work; test project deleted.

**2026-11-27 end — OPEN DESIGN (no code yet), waiting for user's answers:** (1) Working-time split: attendance hours are the base; split each day's work time by project → task (allotment lines + tickets) via agent "Working on" picker + auto-suggest from folder/repo/site + EOD fixing; untagged time shown as "Not linked to a task"; proposed tables work_tasks, work_segments, eod_reports, eod_entries. (2) EOD page pre-filled from plan/tickets/hours. (3) Notifications: one server service → portal bell + Web Push and agent popups; TL reminded when checked-in people have no work assigned (needs a "Team lead" on employees). Asked: web-only vs web+agent; first reminder time; picker required?; auto-tag vs suggest; project vs task level.
