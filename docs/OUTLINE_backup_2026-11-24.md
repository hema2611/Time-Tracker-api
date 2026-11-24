# Project Tracker – master outline

Internal tool so client ↔ team conversations, changes, meetings, bugs and documents stop living in WhatsApp.
We fill this outline **one module at a time**. Status per module: `Decided` · `Prototyped` · `Open` (not discussed yet).

Last updated: 23 Nov 2026

---

## 0. Core idea (Decided)

- One place per project: everything logged, nothing deleted.
- Logging must be quick, or people go back to WhatsApp.
- Every client change is a numbered CR the client approves, so reverts and rework are provable.
- Every entry is marked **Internal** or **Client-visible**.

## 1. Roles & access (Decided)

Roles: **Admin/HR, TL, Developer/Designer, Tester, Client** (client users can be *approver* or *viewer*).

| Can | Client | TL | Dev/Design | Tester | HR |
|---|---|---|---|---|---|
| See projects | own | team | assigned | assigned | all (read) |
| Raise CR / point | ✓ | ✓ | suggest | – | – |
| Approve CR | ✓ | estimate | – | – | – |
| Set batch, assign | – | ✓ | – | – | – |
| Mark point done | – | ✓ | ✓ | – | – |
| Log / reopen bugs | ✓ | ✓ | – | ✓ | – |
| Verify & close point | ✓ | – | – | pre-check | – |
| Run meeting, publish MOM | – | ✓ | – | – | – |
| Internal notes | hidden | ✓ | ✓ | ✓ | ✓ |
| Rework reports | summary | ✓ | – | – | ✓ |

Flowcharts drawn: combined flow + one per role.

## 2. Project setup (Partly decided)

1. Admin creates project: client, TL, team, client users, start date.
2. Proposal uploaded → stored as Proposal v1.
3. Timeline generated from proposal (module 3).
4. Client approves timeline → becomes **baseline** (locked).

Open: create-project form fields; proposal template (fixed headings make AI reading accurate).

## 3. Planned timeline from proposal (Prototyped)

- AI reads the proposal: modules → sections, durations if written, out-of-scope list.
- Chat asks optional questions: start date, total months, months per module, sequential/overlap, UAT + buffer. Skip = AI assumes.
- Each item tagged **You / Proposal / AI assumed**.
- Regenerate any number of times (v1, v2…), edit in table, **Save as final**.
- Only a plan, not a tracker. Working days only (weekends skipped).
- Prototype: `timeline-from-proposal.html`
- 23 Nov: the React app (`project-tracker-ui`) now really reads an uploaded PDF in the browser (rule-based, no AI yet): needs "Module 1: Name" headings with features under them, picks up "– N days", "start date:", UAT days and the out-of-scope section. Test file: `Sample_Proposal_Inventory_Billing.pdf`.

Open: holidays/leave in date calc; dependencies between sections; which AI + client consent to send the proposal.

## 4. Structure: Phase → Module → Section (Decided)

- Example: Phase 1 Employees module (2 months) → S-1 Employee master 10 d, S-2 Attendance 12 d…
- Developers log work against a section; CRs are tagged to a section.
- New scope from a CR becomes a new section ("S-6 from CR-11").

## 5. Change requests – CR (Decided)

- Proposal = baseline scope. **Anything outside it = CR**, numbered per project: CR-1, CR-2… never reused, never deleted (only Rejected/Cancelled with reason).
- Fields: number, title, raised by, source (WhatsApp/call/email/meeting + evidence), type (New / Change / Revert of CR-x / Modify CR-x), section, effort, chargeable, timeline impact, status, history.
- Status: Raised → Estimated → Client approved → In batch → Done → Closed.
- Client sees "this moves go-live by +2 days" before approving.
- Closed items are never edited; a later change = new CR linked "modifies".

Open: do small CRs (<1–2 hrs) need client approval or TL only?

## 6. Points lifecycle (Decided)

New → Approved (client) → In batch (TL) → In progress → Done (dev) → Tested (tester) → Client verify → Closed.
Fail → Reopened with reason **bug** (team) or **requirement changed** (client rework) → next batch.

## 7. Weekly meetings & MOM (Decided)

- Points live across meetings. Each meeting sets status: New / Closed / Carried / Extended (reason required) / Reopened / Dropped. Unfinished points carry over automatically.
- **Batches:** client commits a set of points, verifies them next meeting.
- **Client owes** items (e.g. "will share remaining points") are tracked with overdue age.
- **Waiting on:** Team / Client / Third party.
- Scorecard per meeting (closed, new, carried, extended, reopened, open-points trend) + flags (stuck 3×, extended 2×, scope creep).
- Agenda auto-built from open points.
- **MOM auto-generated** from meeting data (+ optional AI summary of notes/transcript), TL reviews, then sends.
- Send: Gmail automatic (PDF + Confirm link); WhatsApp via share button first, official Business API later.
- Client confirms MOM within 48 hrs, else "not disputed".

Open: Google Meet or Zoom (for transcripts)?

## 8. Live tracker – planned vs actual (Decided, not prototyped)

- Baseline (locked) vs revised target (baseline + approved CR days) vs current estimate vs actual start/end.
- Delay always split: **CR days (client)** vs **team delay**.
- Actual start = first work log; actual end = TL marks complete.
- Current estimate: TL enters; system's calculated estimate shown as a hint.
- Status: On track / At risk / Delayed / Completed (auto rules).
- Re-baseline only with client approval; old baselines kept.
- Every date change logged (who, when, why, which CR).

## 9. Work logs & hours (Decided)

- Each person logs: date, project → section, work type (Planned / CR / Bug / Revert / Meeting / Testing), linked item, hours, note, progress %.
- Feeds: team workload, rework report, section progress, actual dates.
- Helpers: 6 pm reminder, copy yesterday, optional timer. TL can correct (history kept).

Open: exact hours or rough (1/2/4/8)?

## 10. Bugs (Open)

Reported by, severity, steps, fix notes, tester verify, reopen. Not designed in detail yet.

## 11. Documents (Open)

Proposals, specs, reports, MOM PDFs – versioned, per project.

## 12. Calendar (Decided, basic)

Per project + combined. Meetings, milestones, releases/UAT, deadlines, leave (internal only). Reminders. Google/Outlook sync later.

## 13. Client portal (Decided, not prototyped)

Overview, timeline, meetings + MOMs, calendar, my requests, pending approvals, documents. Simple UI. Never sees internal notes.

## 14. Reports for HR / management (Prototyped)

Rework report (hours split planned/CR/bug/revert), client response time, team workload, delays.
Prototype: `admin-hr.html`

## 15. Notifications, search, settings, audit (Open)

Notifications, global search, working days & holidays, CR approval rules, email/WhatsApp setup, audit log.

## 16. Automation with n8n (Decided: capture only)

- Confirmed 20 Nov: n8n only **captures** (Gmail, WhatsApp, Google Meet) and drops items into the tracker's Inbox. It never changes CRs, timelines or statuses. Users act on Inbox items inside the tool.

- n8n = intake + glue only (email/WhatsApp/calendar/Drive → tracker, tracker → notifications). Business rules (CR numbers, approvals, timeline) stay in our backend.
- AI never creates a real CR: it creates an **Inbox item** (suggested type, title, project, confidence, evidence) that the TL accepts / edits / rejects in one click.
- Planned flows: email → CR/bug inbox; WhatsApp → inbox; meeting transcript → MOM draft; daily reminders/digests; client approval reminders; overdue "client owes"; weekly status report; proposal upload → timeline draft.
- Self-host n8n (client data). Keep raw email + attachments as evidence.

---

## Phases of building

- **MVP:** roles, projects, proposal → timeline, CRs + approval, meetings + MOM, work logs, bugs, documents, client portal.
- **Phase 2:** WhatsApp/email import, notifications, planned-vs-actual tracker, reports.
- **Phase 3:** AI summaries, auto-extract CRs from pasted chats.

## Prototypes so far

| File | Covers |
|---|---|
| `admin-hr.html` | Dashboard, projects, project page (timeline, CRs, meetings, activity), rework, team, calendar, users & roles |
| `timeline-from-proposal.html` | Module 3 |

## Open questions list

1. Small CRs: client approval or TL only?
2. Client CR approval: in-portal click enough, or email copy too?
3. Hours: exact or rough?
4. Google Meet or Zoom?
5. Timeline baseline: must client approve before work starts?
6. Our company only, or sell to other agencies later?
7. Which AI, and is sending proposals to it OK with clients?
