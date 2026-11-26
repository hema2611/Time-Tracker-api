---
name: project-tracker-history
description: "Project tracker (standalone product) — history of decisions and modules built 2026-11-19 → 11-24 (UI, API, CRs, AI, EOD, documents)"
metadata:
  node_type: memory
  type: project
  originSessionId: 8bd27e38-9479-4fef-bcf7-24cd83b22c0d
  modified: 2026-11-26T05:41:30.249Z
---

Standalone internal tool: tracks client↔team CRs, meetings/MOMs, timelines, work logs, rework. Real product for real users — production-grade (real backend, DB, login, stored files, server-side AI key, audit), never demo shortcuts. Not tied to any other project (own repos, DB, config).

Plan doc: `docs/OUTLINE.md` in the API repo (+ Project_Tracker_Master_Plan.pdf, flow-chart.svg, prototypes, sample proposal PDF). Read it first; update it after each decision.

Stack: API = Node 24 ESM, Express 5, mysql2, JWT httpOnly cookie, zod (`npm run migrate|seed|dev`). Web = React + Vite + Tailwind, theme "night rail" (dark navy, cyan→violet, Sora + IBM Plex Sans), foldable sidebar. User likes very modern UI, readable sizes, adjustable things, full-width wizards (no wide empty space), AI that feels like real chat.

DB: `track_project` on the dev MySQL server 161.97.171.209 ONLY (user created it). Hard guard in src/config.js (ALLOWED_DB) + per-connection SELECT DATABASE() check. Never 161.97.164.20 (live). Never touch any other database on that server. An unused earlier DB `project_tracker` exists there — not dropped (needs user's yes). No Docker.

AI: Gemini FREE tier for testing (primary gemini-3.5-flash-lite, fallback gemini-4-hydrogen, 45 s timeout; interactions API input `{type:'user_input', content:[document, text]}`); paid provider only after the app is finished; provider = one-line switch. `node scripts/test-ai-read.js <pdf>` tests without DB writes. AI only where reading/writing language saves time — never for dates, statuses, approvals, totals.

Test logins: demo@tracker.local (admin), Test TL / Test Developer @test.local; ALL test users use the same test password (TEST_PASSWORD in api .env; `node scripts/set-test-passwords.js`).

Built 2026-11-19 → 24: projects, create/existing-project wizards, proposal upload + AI reading (proposal now OPTIONAL), timelines saved with versions, timeline AI assistant (100 msgs/user/day), CR module + Inbox. Team/Reports/Settings pages still sample data.

Decisions (OUTLINE.md): WhatsApp capture dropped (paste-into-portal only, no unofficial bots); developer raises CRs with estimate — small CR can start at once, big CR needs approval; baseline never moves on its own; NO n8n — all automations in the backend with an in-portal "Reports and alerts" screen; EOD written in the tracker only, developer EOD drafted by AI from GitHub commits; documents in a Google Drive shared drive (portal-only writes), client email attachments auto-filed via a files@ mailbox (waiting on company admin). Open: small-CR limit, client approval of big CRs, small-CR cap, support period, AI assistant for anything in the portal (not built).

GitHub: Time-Tracker-api → github.com/hema2611/Time-Tracker-api, Time-Tracker-web → github.com/hema2611/Time-Tracker-web (private, main). Work folders C:\Users\Hp\Documents\GitHub\Time-Tracker-api / -web; old project-tracker-api / -ui folders are OUTDATED copies (not deleted — needs user's yes). Paused: web mobile-layout fixes (top menu cut off on phones, stepper wraps, tables squash).

Attendance / desktop agent work from 2026-11-24 on: [[time-tracker-resume-here]], [[time-tracker-agent-state]].

**Why:** user said ideas were getting scattered and they were forgetting what was discussed.
**How to apply:** read OUTLINE.md and the resume note first; one module at a time; record each decision.
