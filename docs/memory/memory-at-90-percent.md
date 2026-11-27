---
name: memory-at-90-percent
description: STRICT RULE — when the daily token limit reaches 90%, update the resume memory before anything else
metadata:
  type: feedback
---

STRICT: when the daily token/usage limit reaches 90%, stop and update memory first ([[time-tracker-resume-here]]), in both the Claude profile memory folder and the shared copy docs/memory. Record for EACH repo (Time-Tracker-api, -web, -agent):
- what is pending, and exactly where work stopped (file, step, next action)
- uncommitted changes (git status)
- anything stashed (git stash list)
- what still needs merging (branches, colleague's commits, unpushed work)
- any merge conflicts present right now

**Why:** user doesn't want work lost or forgotten when the limit cuts the session off.
**How to apply:** check usage during long sessions; at 90% write this before continuing.
