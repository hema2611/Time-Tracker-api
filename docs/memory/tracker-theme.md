---
name: tracker-theme
description: STRICT — before ANY UI/design work (web app or agent windows) read Time-Tracker-web/DESIGN.md and the /design prototypes; they override the current look
metadata:
  type: feedback
---

**Before designing anything** (web pages, agent windows, popups, widget): read `C:\Users\Hp\Documents\GitHub\Time-Tracker-web\DESIGN.md` first and match the prototype in `Time-Tracker-web/design/` if one exists for that screen. User said (2026-11-27): "always use this and refer this before designing".

LOGOS (user, 2026-11-27): single icon anywhere (favicon, agent app/tray/installer icon, extension icon, collapsed sidebar, popups) = the W mark (three violet triangles): web public/brand/imaginet-mark.png / <Mark/>, agent assets/mark.png + icon.png/icon.ico/tray*.png, extension icon16/48/128. Full logo with name = ImagiNET Ventures wordmark (web imaginet-logo-clear.png / <Brand/>, agent assets/logo.png). Never the old round orb, never hand-drawn SVG triangles. DESIGN.md §0.

Prototypes saved in Time-Tracker-web/design/: tracker-light-prototype.html (web sign-in + Attendance), agent-window-prototype.html (agent sign-in + main window), agent-floating-widget.html (dot/pill/expanded widget), palette-from-logo.html (brand scale + tokens + contrast).

Key rules (full detail in DESIGN.md): pure white (light) / pure black (dark) page; tokens bg, surface, surface-2, line, fg/fg-2/fg-3, violet, violet-strong, violet-tint, ok/away/idle/brk/off; brand purple ONLY from the logo scale #1A0833…#F4EDFA (no indigo/blue purples); --grad-brand for buttons/ring, --grad-panel only on sign-in panel; Outfit light (never bold) titles, Inter UI, JetBrains Mono tabular for times; cards = surface + hairline line + shadow-card, radii 11/16/22; sidebar active = violet-tint + 3px violet bar; details in a right drawer; violet never means a status; pages use only theme tokens, no hex. Agent windows must share tokens with the web app (tokens.css generated from web theme.css, fonts bundled locally).

State 2026-11-27 (later): theme.css MOVED to DESIGN.md tokens (old slate/indigo/cat-* names re-pointed as aliases; --color-white is real white); components/ui.jsx has Button/Input(Show-Hide)/Card/Chip/StatusDot/Avatar/KpiCard/Drawer/ProgressRing/Skeleton/EmptyState; Login (+forgot/reset) and Attendance rebuilt; colleague pages (Tickets, Leave, Reimbursements, Work Allotment, Repo) still use old names = to restyle.

**Why:** user wants one consistent premium look and was unhappy when pages kept the old look.
**How to apply:** read DESIGN.md before any UI change; follow its "Never do this" list; check both themes in the browser before finishing.
