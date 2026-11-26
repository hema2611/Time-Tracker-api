---
name: time-tracker-agent-state
description: Time Tracker desktop agent + attendance module — what's built, rules decided, and the ADMIN/IT items deliberately left for last
metadata:
  type: project
---

Part of the standalone project tracker ([[project-tracker-history]]). Work folders (2026-11-25): C:\Users\Hp\Documents\GitHub\Time-Tracker-api, Time-Tracker-web, Time-Tracker-agent (Electron; no GitHub repo yet). Old project-tracker-api/-ui = outdated copies, kept. Test run: API `PORT=4001`, web `WEB_PORT=5181 TRACKER_API=http://localhost:4001`, agent installed per-user at %LOCALAPPDATA%\Programs\time-tracker-agent (0.2.2 installed; later changes pending install). Installer: `npx electron-builder --win` (winCodeSign extracted manually into cache\winCodeSign-2.6.0). Never rebuild/reinstall unless user says ([[tracker-agent-no-reinstall]]). NOTHING committed yet.

Decided rules: idle grace 10 min (backdated); strict full-screen reason question for breaks ≥15 min (no skip/close, survives restart, PC-off gaps); Claude Code working = work, NO cap (detected via ~/.claude/projects jsonl mtimes); locked = break; office day 9 h; 5 categories At desk / Away work (Meeting, Client call, Training, Work away — shown separately) / Idle / Break / Offline; unproductive sites/apps = shown + flagged, NOT subtracted (also when Claude works); sign-in once per PC (no device-ID/IP login); client accounts refused; no Pause button, no app-usage list in agent UI; logo inside tool, orb = app icon only.

Built: attendance day/team/month/Excel, checks (network, late, clock, too-perfect, no signals, no output, unproductive, no extension, other browser), site rules tab + 24 starter rules, browser extension (Chrome/Edge MV3, posts to agent 127.0.0.1:47821), incognito fallback via window title. Bypass review: Time-Tracker-api/docs/Agent_Bypass_Review.xlsx (guard rows written in script, file was open in Excel — regenerate).

Location (2026-11-25): check-in/out place from what's available only — network IP (Office/Remote via admin "Office networks" list), Wi-Fi name, exact place if Windows location is on; if off, agent asks ONCE (Open settings / No thanks; "No thanks" = never again). Read at start, unlock/wake, every 30 min — never continuous. Mac exact place skipped. Restart task now every 1 min. A side session ("btw: yes") added server checks: silent agent in office hours, two PCs, new PC, heavy away work.

**ADMIN / IT ITEMS — user said do these LAST (2026-11-25):**
- Staff Windows accounts without admin rights; agent installed for all users (per-machine) so Startup entry / restart task / uninstall can't be removed.
- Browser policies (installer writes on Windows, config profile on Mac): ExtensionInstallForcelist, IncognitoModeAvailability=1 / InPrivateModeAvailability=1, BrowserGuestModeEnabled=false, BrowserAddPersonEnabled=false; optional block other browsers.
- Publish extension unlisted: Chrome Web Store ($5 once) + Edge Add-ons (free) — required for force-install.
- Windows auto-lock; written HR policy on tampering.
- Mac build (needs a Mac / GitHub Actions) + Accessibility/Screen Recording permission; Mac code untested.
- Host tracker on a real server, rebuild agent with real API address (agent-config.json) before staff rollout.
- Later guards: TPM-bound key, silence alert to manager, mouse-jiggler (injected input) detection, Claude-process check, one active PC per person.

**Why:** user wants features finished first and IT/admin hardening done together at the end.
**How to apply:** don't start these unprompted; remind the user of this list when features are done or before any staff rollout.
