---
name: tracker-theme
description: "Tracker web theme \"Obsidian & Violet\" — single theme file Time-Tracker-web/src/theme.css; every page must use it; real ImagiNET logo only"
metadata:
  node_type: memory
  type: feedback
  originSessionId: a9f251d7-30d1-4c5e-ab34-c941d729050c
  modified: 2026-11-26T06:04:24.468Z
---

Every page of the tracker web app (Time-Tracker-web) uses ONE theme file: `src/theme.css` (imported by index.css). Theme = "Obsidian & Violet", derived from the ImagiNET Ventures logo (chrome violet wordmark + faceted triangles, violet orb): canvas #07060B, surface #0E0C16, elevated #151226, sidebar #0A0911, hairline rgba(167,139,250,.14), brand-deep #45297F, violet #7C5CE0, violet-light #A78BFA, sheen #DCCFFD, text fg #F4F2FA / fg-2 #BDB8CE / fg-3 #9A96A8.

Two themes (added 2026-11-26): dark (default) and light "Pearl & Violet" (canvas #F6F4FB, surface #FFFFFF, violet #6A45D6, text #17131F/#4A4458/#625C70). Same class names; values in theme.css under :root (dark) and [data-theme="light"]; `@theme inline` maps names → --t-* vars. Switch = ThemeToggle in src/lib/theme.jsx (menu footer, phone header, sign-in corner), saved in localStorage `tracker.theme`, first visit follows OS; index.html sets data-theme before paint.

Rules:
- Every new colour needs a dark AND a light value. Never `text-white` for normal text (vanishes in light) → text-fg; white only on violet/coloured fills. Overlays/backdrops = bg-black/NN, never slate-900/NN (slate flips between themes).
- No hex/rgba in pages. Use semantic classes (bg-canvas, bg-surface, bg-elevated, border-line, text-fg/-fg-2/-fg-3, bg-violet, shadow-glow, shadow-pop, cat-work/away/idle/break/off) or the re-pointed Tailwind names (slate/indigo/green/amber/red map onto the theme). Cards = bg-surface, never bg-white.
- Text must stay readable on the dark background (≥7:1). User complained grey text was invisible on black (2026-11-26) → lifted greys; never add darker grey text.
- Logo = the ORIGINAL ImagiNET Ventures logo (original has a black matte; app uses public/brand/imaginet-logo-clear.png made transparent by a script; orb = imaginet-orb.png; sources in Time-Tracker-agent/assets). Never an invented "iN" tile, never stretched (keep self-start/object-contain, h-8). Light theme deepens it with class `brand-word`.
- New colours go into theme.css first, then get used.

**Why:** user (2026-11-26) asked for a theme file based on the logo and that every page use it; then asked to replace the made-up "iN" mark with the original logo.
**How to apply:** any new or changed web page/component: read theme.css, use its names only; also apply the same palette to the desktop agent UI when it's restyled. Related: [[project-tracker-history]], [[time-tracker-agent-state]].
