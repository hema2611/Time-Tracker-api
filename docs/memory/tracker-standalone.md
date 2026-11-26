---
name: tracker-standalone
description: "The project tracker / Time Tracker is a standalone project — keep its memory, files, repos and config completely separate from any other project"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8bd27e38-9479-4fef-bcf7-24cd83b22c0d
  modified: 2026-11-26T05:41:44.938Z
---

Everything about the project tracker and the Time Tracker agent lives only in this project's memory and its own folders (Time-Tracker-api, Time-Tracker-web, Time-Tracker-agent). Never save tracker notes into another project's memory, never put tracker files or launch settings in another repo, and never mention other projects in tracker notes.

**Why:** 2026-11-26 the user found tracker memories saved under another project's memory (the chat had started in that folder) and said the tracker is a separate, standalone project; they asked to remove every trace of it there.
**How to apply:** before writing any memory, check it is this project's memory folder; if a chat starts in another folder, switch to a tracker folder first.
