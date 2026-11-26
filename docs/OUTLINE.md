# Project Tracker – master plan

One place per client project for the plan, every change request, meetings and what was agreed, so nothing lives only in WhatsApp or email.
This is a real product for real users, not a demo. It is a standalone project.

Last updated: 24 Nov 2026 (flow, automation, AI and features added; n8n dropped)
Previous version kept as `OUTLINE_backup_2026-11-24.md`.

**Status words used below**

| Status | Meaning |
|---|---|
| Built | Working against the real database and tested |
| Decided | Agreed, not built yet |
| Open | Still to discuss |
| Sample | Screen exists but shows sample data |

---

## 1. Goals and rules

- Every client change is a numbered change request (CR) with its source as proof, so reverts and rework can be shown.
- Nothing is deleted. Items are rejected, cancelled or deactivated, with a reason, and stay in the history.
- Logging must be quick, or people go back to WhatsApp.
- AI suggests, people decide. The AI never creates a CR, changes a status or saves a timeline on its own.
- Every entry is either internal or visible to the client.
- No tool that can get the company's WhatsApp number banned. No unofficial WhatsApp connectors.

## 2. Users and roles (Built)

Roles: Admin/HR, Team lead (TL), Developer, Designer, Tester, Client (approver or viewer).

| Can | Client | TL | Dev / Designer | Tester | Admin / HR |
|---|---|---|---|---|---|
| See projects | own | led or member | member | member | all |
| Raise a CR | yes (planned) | yes | suggest | – | yes |
| Estimate a CR | – | yes | – | – | yes |
| Approve a CR | approver only (planned) | records approval | – | – | records approval |
| Paste messages into the Inbox | – | yes | – | – | yes |
| Plan and save the timeline | – | yes | – | – | yes |
| Manage users and projects | – | – | – | – | yes |

How sign-in works today:
- The admin creates a user with a temporary password; the user must change it at first sign-in.
- Session is an httpOnly cookie, 12 hours. A deactivated user is blocked on the next request.
- Login is rate-limited. Every important action is written to an audit log.

## 3. Projects (Built)

- Admin creates a project in three steps: details, team and client users, proposal.
- Client users added here are created as "no password yet" until the admin sets one.
- Each project has its own page with two tabs: **Inbox** and **Change requests**.
- "Add an existing project" (one already running) is designed but **not connected** to the database yet.

## 4. Proposal and AI reading (Built)

- The proposal PDF (up to 20 MB) is stored with the project as Proposal v1, v2…
- At upload the user chooses:
  - **Draft it with AI:** the AI reads the PDF and returns modules, features, days if written, start date, UAT days, total months and exclusions.
  - **I have my own timeline:** the PDF is only stored, no AI is used.
- Works for any kind of proposal (software, research, grants). Tested on the sample proposal and a 19-page grant proposal.
- If the AI fails or finds nothing, the built-in rule reader is tried; if that also fails, the project and file are still saved.
- "Build timeline from proposal" on a project card reads the stored PDF again, without uploading.
- Limit: 20 AI proposal reads per user per day.

## 5. Planned timeline (Built)

Structure: **Module → Section**, in working days (Monday to Friday).

- Drafted from the proposal, or typed in by hand.
- Every row shows where its days came from: **You**, **Proposal** or **AI assumed**.
- Edit in a table, or directly on the plan chart:
  - drag a bar's right edge to change its days
  - drag a name to reorder (a module moves with its sections; a section can move to another module)
  - zoom in and out, and widen the names column (remembered per computer)
- Each change can be kept as a version (v1, v2…). **Save as final** stores it in the database as a new version and sets the project's go-live date.
- The first saved version sets the **baseline** go-live; later versions move only the current go-live.

Open:
- Holidays and leave in the date calculation (on hold).
- Dependencies between sections.
- Client approval of the baseline before work starts.

## 6. Timeline assistant (Built)

- A real AI chat (Gemini) on the timeline screen. Opened from the floating "Assistant" button; × or Esc closes it.
- Understands plain language: "make the first module 6 weeks", "fit it in 4 months", "what are the risks?".
- Changes come back as a new plan version with a tag ("Plan updated: version 3, finishes 6 Aug 29").
- Shows its progress while working and types out the answer.
- Limited to this project's timeline; unrelated questions are declined.
- Limit: 100 messages per user per day.

## 7. Change requests (Built, partly)

- Numbered per project: CR-1, CR-2… never reused, never deleted.
- Fields: title, what was asked, type (new / change to existing / undo an earlier change), source (WhatsApp, email, call, meeting, portal), the original message as proof, who asked and when, effort in days, chargeable, status, history.
- Status flow:

  Raised → Estimated → Client approved → In progress → Done → Closed

  Rejected and Cancelled are possible from the early steps and need a reason. Done can be reopened. Closed, Rejected and Cancelled are final; a later change is a new CR.
- Every status change is kept in the CR's history with who and when.
- A CR can be raised from the Inbox or added by hand (from a call or meeting).

**Decided 24 Nov 2026: who raises CRs, approval and timeline effect**
- WhatsApp capture is dropped for now. The **developer** raises the CR in the portal by hand and enters the estimate in days.
- **Small CR** (estimate at or under the limit): the developer can start straight away.
- **Big CR** (over the limit): waits for approval; work must not start before it.
- Limit: 2 or 3 days, still to confirm (suggested: a project setting, default 2). Who approves big CRs is still to confirm.
- Loophole to close: many small CRs add up. Suggested: once small CRs in a project pass a total (for example 5 days), the next ones need approval and the TL is alerted.
- Timeline effect:
  - Raised or waiting for approval: timeline unchanged, shown as "pending +N days".
  - Small CR started, or big CR approved: its days are added and go-live moves.
  - Rejected or cancelled: nothing added.
- Where an approved CR's days go, chosen when it is approved, with the new go-live shown before saving:
  1. **Inside its module (default):** the module gets longer and every later module moves by the same working days.
  2. **As separate work at the end:** a new section after the last module; other modules keep their dates, only go-live moves.
  3. **In parallel:** done alongside by someone free; no dates move.
- The baseline go-live never changes on its own. Each moved module shows "+N days from CR-x", and go-live shows the total split by CR.

**Decided 24 Nov 2026: testing and closing**
- When the developer marks work done, it goes to the **tester**, not straight to closed.
- The tester tests and verifies it. Pass: **only the tester closes it**. Fail: the tester reopens it with a reason, it goes back to the developer to fix, and back to the tester again. This loops until it passes.
- Applies to change requests and bugs. Each reopen is kept in the history, so rework can be counted.

Not built yet:
- Show the client the timeline impact ("moves go-live by +3 days") before approval.
- Approved CR days added to the timeline as a new version, keeping the baseline.
- Client clicks "Approve" in the portal instead of the TL recording it.
- Link "this CR modifies CR-x".

Open:
- Do small CRs (under 1–2 hours) need client approval, or TL only?
- Is an in-portal click enough as client approval, or is an email copy needed?

## 8. Inbox: capturing requests from WhatsApp and email (Built, on hold)

**24 Nov 2026: WhatsApp capture is on hold.** Developers raise CRs by hand with the source noted (call, email, meeting). The Inbox below stays built and can be used for pasted text, but it is not part of the main flow for now.

Decided approach: **paste into the portal**. No bot in WhatsApp groups (ban risk ruled out).

1. The TL copies messages from the WhatsApp group (or an email) and pastes them into the project's Inbox.
2. The AI picks out **change requests, bugs, decisions and things the client owes**, and ignores greetings, thanks and emojis.
3. Each suggestion shows the original message, the sender and the time as proof.
4. The TL edits the title if needed and chooses:
   - change request → **Accept as change request** (gets the next CR number)
   - bug, decision, client owes → **Keep on record**
   - anything → **Not needed**

Tested on a sample WhatsApp chat: 5 correct items found from 10 messages, noise skipped.

Next:
- **Gmail, connected live** (official Google sign-in, read-only, one project mailbox or label). Emails flow into the same Inbox automatically.
- **Weekly chat export upload** as a safety net, so anything not pasted is still caught.
- **Share from phone:** select messages in WhatsApp → Share → Tracker (Android, needs testing on a real phone).
- Later, clients raise formal requests in the portal themselves.

Not used: unofficial WhatsApp connectors (WAHA, Evolution API, Baileys) because the number can be banned.

## 9. Bugs (Decided, not built)

- Every bug is linked to the **section or CR** it was found in.
- Bugs come from the tester, the client during UAT, or the weekly meeting.
- They go to the developer to fix, then through the same test loop as CRs: the tester verifies; pass closes it, fail reopens it with a reason.
- Still to design: severity, steps to reproduce (AI can tidy the tester's notes), attachments.

## 10. Weekly meetings and minutes (Decided, not built)

- Open items carry across meetings. Each meeting marks items: New / Closed / Carried / Extended (reason) / Reopened / Dropped.
- Client commits a batch of items and verifies them at the next meeting.
- "Client owes" items tracked with how long they are overdue.
- Agenda built from open items. Minutes generated from the meeting, TL reviews, then sends.
- Client confirms the minutes within 48 hours, otherwise "not disputed".
- **Changes and bugs raised by the client in the meeting** are logged from the minutes: changes go to Raise CR, bugs go to the developer's fix step.

Open: Google Meet or Zoom (for transcripts)?

## 11. Planned vs actual (Decided, not built)

- Baseline vs revised (baseline + approved CR days) vs current estimate vs actual dates.
- Delay always split into **CR days (client)** and **team delay**.
- Status: On track / At risk / Delayed / Completed.
- Re-baselining only with client approval; old baselines kept.

## 12. EOD reports and work logs (Decided 24 Nov 2026, not built)

EOD (end-of-day) reports are written **in the tracker only**. The company's existing EOD app is not connected; for these projects the tracker is where EODs are written.

**Developers: EOD from GitHub commits**
1. The admin links each project to its GitHub repository (one or more), once.
2. Each developer's tracker account is linked to their git email(s).
3. At the end of the day the backend fetches that developer's commits from the linked repositories (read-only GitHub access).
4. Commits are attached to work: a commit message or branch that names a CR or section (for example `CR-4`, `S-12`) is linked to that item; others are listed under the project as general work.
5. AI writes the EOD in plain, HR-readable language, grouped by project and item, not raw commit messages.
6. The developer reviews it, adds hours (commits don't show hours; the gaps between commits are only a hint) and anything without commits (calls, research, meetings), then submits.
7. The EOD is saved against the person, date and items. The team lead sees the team's EODs each evening; hours feed the reports.

**Testers, designers, team leads:** their EOD draft comes from portal activity (tested, closed, reopened, bugs logged, approvals), written up the same way.

**What it feeds:** hours spent vs estimated per section and CR, rework hours (reopened items and bugs), actual start and end of sections (days late, delay split), team workload.

**Team rule needed:** commit messages must name the CR or section and say what changed. "fix" or "wip" cannot be turned into a useful EOD.

**Still to decide:** GitHub access method (a GitHub App installed on the organisation is the safer choice over a personal token); EOD time and reminder; whether a missed EOD is flagged to the team lead.

## 13. Client portal (Decided, not built)

Overview, timeline, change requests waiting for approval, meetings and minutes, documents. Never shows internal notes.

## 14. Reports for HR and management (Sample)

Rework hours (planned / CR / bug / revert), client response time, team workload, delays. Screens exist with sample data.

## 15. Portal-wide assistant (Decided, not built)

- One assistant on every page, opened from the same button.
- Sees only what the signed-in user may see.
- Answers questions ("which projects finish in March?").
- Prepares actions ("create a project called MBS") as a confirmation card; nothing is saved until the user presses Confirm.
- Still declines general questions unrelated to the portal.

## 16. Documents and files (Decided 24 Nov 2026, not built)

Every file for a project is kept in one place: the project's **Documents** tab.

**Storage:** files are kept in **Google Drive**, in a company shared drive with one folder per project, created automatically. The database stores only the details (name, project, version, who added it, source) and the Drive file ID and link. Files are never stored in the database.
- The portal is the only way to add or delete files. Team members get **view-only** access to the Drive folders.
- Files are never shared with clients through Drive links; client-visible files are opened through the portal, which checks permissions.

**In the Documents tab:**
- Upload by drag and drop; categories (Proposal, Requirements, Designs, Client files, Meeting notes, Handover, Other).
- Versions: a new copy of the same document keeps the old ones.
- Link a file to a CR, bug, section or meeting as proof.
- Who added it, when, and the source (upload, email, client).
- Each file is internal or client-visible; files from email start as internal.
- Search by name, category, date and linked item. Later: AI search inside documents.
- Never deleted: archived with a reason.
- Clients can upload files from their own view.

**Files that arrive by email (automatic):**
1. Google Workspace rule (set once by the admin): any email from or to a client domain also goes to one mailbox, `files@<company domain>`. No one's personal mailbox is connected.
2. The backend reads only that mailbox, read-only, every few minutes.
3. Each email is matched to a project by the project's filters: client email addresses, client domains, subject phrases, and the email thread. Unmatched emails go to an **Unsorted** list for the team lead.
4. Signatures, logos, tiny inline images and duplicates are skipped. Size limit, blocked file types and a virus scan; anything failing is held and flagged.
5. Safe attachments are uploaded to the project's Drive folder (for example `Retail ERP / Client files / 2026-11`) and recorded with sender, date, subject and the email itself as proof.
6. The team lead is notified ("3 new files from Sunrise Traders") and can rename, categorise, link to a CR or bug, and mark client-visible.

**If a client forgets to copy the tracker:** the company rule already catches it. Without the rule, the fallbacks are: the team member adds the project address when replying, or forwards the email; and the portal nudges (CRs from email need the file; "documents received this week?" on the meeting agenda; the team lead's digest flags projects with no new files).

**Waiting on the company admin (escalated 24 Nov 2026):**
- Is the Gmail content compliance rule available on our Google Workspace plan?
- Create the `files@` mailbox (one extra user licence a month, roughly ₹150–900 depending on the plan; to confirm).
- Approve the portal's access to one shared drive.
Until then: manual upload and client upload work on their own.

## 16b. Settings and notifications (Open)

CR approval rules, working days and holidays, notification preferences. The Settings screen is sample only.

## 17. Look and feel (Built)

- Dark theme with one cyan-to-violet accent; fonts Sora (headings) and IBM Plex Sans (text).
- Sidebar menu that folds to icons; on phones the menu moves to the top.
- Screens still on sample data are tagged "sample" in the menu.

## 18. Complete flow (Decided, 24 Nov 2026)

One chart covers the whole portal, with a lane per role: `flow-chart.svg` (also in the PDF).

**Set-up (once)**
1. Admin adds users and creates the project with the proposal.
2. Team lead plans the timeline (AI draft or own).
3. Client approves the plan; it becomes the baseline.
4. Team lead assigns sections to developers, who start work.

**Change requests**
5. The client asks for a change: by call, email or in the weekly meeting.
6. The developer raises the CR with its source and an estimate.
7. Small CR (at or under the limit): the developer starts at once.
8. Big CR: the team lead reviews it, then **the client approves** (assumed, to confirm) or rejects with a reason.
9. The plan is updated: by default inside the CR's module, later modules move. A big shift needs the client to agree a **new baseline**.
10. The team lead assigns the CR; the developer starts it.

**Build and test (planned sections and CRs alike)**
11. The developer works on a timeline section (or a CR) and marks it done.
12. The tester tests and verifies. Pass: **only the tester closes it**. Fail: reopened with a reason, the developer fixes it, and it loops until it passes.

**Every week**
13. Team lead runs the weekly meeting; the client confirms the notes.
14. Changes raised in the meeting go to Raise CR; bugs go to the developer's fix step.

**Go-live and close**
15. Client UAT; any issues go through the test loop.
16. Client signs off. Team lead does go-live and handover.
17. Support period: the developer fixes issues.
18. Team lead closes the project. Admin and HR see the final reports.

**Testing of planned work.** Even with no CRs, every timeline section goes through testing. Each section moves: Not started → In progress → Ready for testing → (tester) Closed, or bugs logged against it and back to the developer until it passes. The actual start and end are recorded, so each section shows days late. Days late on sections are the "team delay" half of the delay split; approved CR days are the "client" half.

Not drawn, but needed: admin adding or removing people during a project, reassigning the team lead.

## 19. Automation: all in the backend, no n8n (Decided 24 Nov 2026)

**Decision:** every automation is built in the backend. n8n is not used. Reason: we have developers building the portal anyway, and every automation here is part of the product, so it belongs with the portal's own rules, permissions and audit log. Another system would only add one more server to secure, host and back up.

Built in the backend (code, email templates, one scheduled job for reminders and reports):
- Welcome email with sign-in link.
- Approval emails with secure one-time Approve / Reject links: plan, big CRs, new baseline, meeting notes, UAT sign-off. Reminders when they wait more than 2 days.
- Notifications: assigned to you, ready to test, reopened with reason, waiting for your approval.
- "Not disputed" after 48 hours for meeting notes.
- Weekly meeting: agenda the day before, minutes drafted by AI from pasted notes or an uploaded transcript (works with Meet, Zoom or Teams, no Google connection needed).
- Team lead's daily digest, weekly status report per project, project-close summary.
- Calendar invites for meetings, UAT and go-live, sent as email invites.
- **Reports and alerts screen** (see section 21).

Later, only if email capture comes back: read one dedicated project mailbox, read-only, from the backend.

**Kept open for the future:** the portal will have a clean, secure API and "something happened" events (CR approved, item closed, go-live moved). If a real need for an outside connection appears later (for example copying chargeable CRs into a billing sheet), any tool, n8n included, can plug in without changing the portal.

## 20. Where AI is used, and where it is not (Decided)

**Rule:** AI is used only where reading or writing natural language saves real time. Anything that can be calculated exactly is code. AI suggests or drafts; a person decides and sends.

AI is used for:
| Step | What AI does | Status |
|---|---|---|
| New project | Reads the proposal, drafts modules and sections | Built |
| Plan timeline | Changes in plain language ("fit in 4 months") | Built |
| Raise CR | Turns a rough note into a clear title and description; suggests the type | Planned |
| Raise CR | Checks against the proposal: already in scope, or new work (with the quote) | Planned |
| Raise CR | Warns of likely duplicates ("similar to CR-4") | Planned |
| Review CR | Suggests an effort range from similar past CRs | Planned |
| Weekly meeting | Turns rough notes or a transcript into minutes, action items, new changes and bugs | Planned |
| Weekly status | Phrases the week's data as a short client update | Planned |
| Fix, reopen | Turns tester notes into clear steps to reproduce | Planned |
| EOD report | Writes the day's EOD from the developer's GitHub commits (or a tester's portal activity); the person adds hours and submits | Planned |
| Final reports | Writes the "why it ran late" summary, citing CRs | Planned |

AI is not used for: dates and working days, go-live shifts, CR numbers, statuses, approvals, report totals, assigning work, or sending anything without a person checking it.

## 21. New features to add (Decided)

1. **Notifications inside the portal:** a bell showing what needs this user.
2. **"My work" page for each role:** developer (my sections, CRs, reopened items), tester (waiting to test), client (waiting for my approval). Most users never need to browse projects.
3. **Delay split on the project page:** "Go-live moved 9 days: 7 from client CRs, 2 from the team."
4. **Rework counter:** how often each item was reopened, per developer and per project.
5. **Client view:** simple, mostly read-only, with Approve buttons; never shows internal notes.
6. **Audit trail screen:** who changed what and when (the data is already logged).
7. **Attachments** on CRs and bugs: screenshots, files, email copies as proof.
8. **Mobile-friendly** approval and testing screens.
9. **Reports and alerts screen** (admin and managers): pick a report type (open CRs, waiting for client approval, projects behind baseline, overdue client promises, items reopened often, hours vs estimate), a condition ("more than 3", "older than 5 days"), which projects, when (daily, weekly, monthly or as it happens), who receives it, and by email and/or the portal bell. With preview, pause and send history. New report types are added by developers; everything else is set by managers.
10. **Project workbook (Excel), one per project, three sheets.** The portal is the master; the workbook is read-only output, rebuilt by the backend after every change (a CR approved or started, a section or bug status change) and downloadable from the project page. Flat rows, no merged cells; rejected and cancelled CRs are kept and marked.
    - **Planned work:** one row per timeline section: module, section, developer, planned start and end, actual start and end, status, tested by, result, bugs found, reopens, days late.
    - **Changes:** one row per CR once approved or started: number, title, type, asked by, source, raised on, estimate, chargeable, approved by and on, started on, status, done on, tested and closed on, reopens, module or section affected, timeline effect.
    - **Bugs:** one row per bug: number, title, found in (section or CR), found by, found during (testing, UAT, meeting), severity, assigned to, status, reopens, dates.
    Still to decide: whether the client can download it.
11. **Documents tab** with Google Drive storage and automatic filing of client email attachments (section 16).

---

## 22. Technical setup

| Part | Choice |
|---|---|
| Frontend | `project-tracker-ui`: React, Vite, Tailwind. Port 5180 |
| Backend | `project-tracker-api`: Node.js, Express. Port 4000 |
| Database | MySQL 8, database `track_project` on the dev server `161.97.171.209` |
| AI | Gemini, free tier for testing. Main model `gemini-3.5-flash-lite`, fallback `gemini-4-hydrogen`, 45 s limit per try |
| Files | Proposals stored on the server under `uploads/` |

Database tables: users, projects, project_members, audit_log, proposals, proposal_readings, timelines, timeline_items, ai_usage, inbox_items, change_requests, cr_history.

**Guards**
- The API refuses to start unless the database is exactly `161.97.171.209` / `track_project`. The live server `161.97.164.20` must never be used.
- Secrets (database login, AI key) live only in `.env`, which is not committed.
- The AI provider is one setting (`AI_PROVIDER`). Switching to a paid provider later is a configuration change plus one adapter file.

**AI and data**
- On the free Gemini tier, Google may use the content to improve its models. Use only sample or test documents and chats until a paid plan is in place.
- Clients should be told their messages are read by AI (a line in the proposal or NDA).

## 23. Build order from here (updated 24 Nov 2026)

1. **Core flow from the chart:** assign work, developer raises CRs with estimate, small/big rule, client approval with go-live impact, plan update (inside module by default), tester verify-and-close loop, bugs through the same loop.
2. **Section testing and bugs:** sections go Ready for testing → tester closes or logs bugs; bug module linked to sections and CRs; project workbook with Planned work, Changes and Bugs sheets.
3. **Backend emails and notifications:** approval links, reminders, "assigned to you", "ready to test", "reopened".
4. **"My work" pages and the notification bell.**
5. **Delay split and rework counter.**
6. **Weekly meeting and minutes,** with AI drafting and changes/bugs logged from them.
7. **AI on CRs:** clean title and description, scope check against the proposal, duplicate warning.
8. **Documents tab** with Google Drive storage; email filing once the admin rule is in place.
9. **Client view.**
10. **Go-live, handover, support period and project close.**
11. **Daily digest and weekly status report.**
12. **EOD from GitHub commits** and real data in Reports; portal-wide assistant.
13. Reports and alerts screen. Outside connections through the API only if a real need appears.
14. Before going live: paid AI plan, production database and server, backups, HTTPS, first git commit and deployment.

## Timeline (estimated 24 Nov 2026)

Built with Claude writing the code; the user reviews and tests each step in the browser before the next one starts. The limit is decisions and testing time, not coding.

| # | Step | Estimate |
|---|---|---|
| 1 | Core flow: assign work, CR with estimate, small/big rule, client approval with go-live impact, plan update, tester verify-and-close | 3–4 days |
| 2 | Section testing, bug module, project workbook | 2–3 days |
| 3 | Emails and notifications (approval links, reminders) | 2 days |
| 4 | "My work" pages and notification bell | 1–2 days |
| 5 | Delay split and rework counter | 1 day |
| 6 | Weekly meeting and AI minutes | 2 days |
| 7 | AI on CRs (clear title, scope check) | 1 day |
| 8 | Client view | 2 days |
| 9 | UAT, sign-off, go-live, handover, close | 1–2 days |
| 10 | Daily digest and weekly status | 1 day |
| 11 | EOD from GitHub commits | 2–3 days |
| 12 | Reports and alerts screen | 2 days |
| 13 | Production setup, security check, deployment | 2–3 days |
| + | Documents: upload, versions, links, Drive storage (2 days); email filing once the admin rule exists (1–2 days) | 3–4 days |
| | **Total** | **about 5–6 weeks** |

Milestones:
- **About 1.5 weeks (steps 1–3):** usable on one internal project.
- **About 3–4 weeks (steps 1–8):** ready for one real client.
- **About 5–6 weeks:** everything in the plan, including Documents.

What decides the speed:
- Daily testing by the user; each step is checked before the next.
- Open decisions answered before step 1: small-CR limit, client approval of big CRs, support period.
- Few direction changes once building starts.
- Tasks only the company can do: GitHub access, production server, paid AI plan, domain.

## 24. Open questions

- Company admin: Gmail content compliance rule, `files@` mailbox, shared drive access (escalated 24 Nov 2026).
- Small-CR limit: 2 or 3 days? (suggested: project setting, default 2)
- Must the client approve big CRs, or only the team lead? (the chart assumes both)
- After how many days of small CRs in total do they need approval too?
- How long is the support period after go-live?

1. Small CRs: client approval or TL only?
2. Client CR approval: in-portal click enough, or email copy too?
3. Hours in work logs: exact or rough?
4. Google Meet or Zoom?
5. Must the client approve the baseline timeline before work starts?
6. Only for our company, or sold to other agencies later?
7. Which paid AI provider, and is sending proposals and chats to it acceptable to clients?
8. Where will production run (server, database, backups)?

## 25. Current state (24 Nov 2026)

- Nothing is committed in either tracker repo yet.
- Test data in `track_project`: demo admin, a test team lead, a test developer, two test projects with proposals, saved timelines, and Inbox items from a sample chat.
- Test logins are in `project-tracker-api/.env` (`ADMIN_*`, `DEMO_TL_*`).
- An unused database `project_tracker` from early setup still exists on the dev server; delete it only after confirming.
