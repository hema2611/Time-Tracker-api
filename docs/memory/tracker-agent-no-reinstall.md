---
name: tracker-agent-no-reinstall
description: Time Tracker desktop agent — don't rebuild/reinstall after each change; batch changes, install only when the user says
metadata:
  type: feedback
---

For the Time-Tracker-agent (Electron, C:\Users\Hp\Documents\GitHub\Time-Tracker-agent): only change code; do NOT rebuild the installer or reinstall/restart the installed agent after each change. Build + install once, when the user asks.

**Why:** user (2026-11-25) was disturbed by the agent vanishing from the tray on every reinstall ("why install everytime, hold and do everything then install at last when i say").
**How to apply:** collect agent changes, tell the user they're pending for the next install; related: [[project-tracker-history]].
