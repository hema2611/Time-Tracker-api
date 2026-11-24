// What every AI provider is asked for, and the one shape the rest of the app relies on.
// The AI only reads and copies. All arithmetic (turning "3–4 days" or "2 weeks" into working days, totals,
// sanity checks) is done here in code, because models are unreliable at unit conversion.

export const PROMPT = `You are reading a project proposal so a project timeline can be planned. The proposal can be for any kind of project (software, research, construction, consulting, a grant application) and in any layout: prose, numbered sections, bullet lists or tables.

Your job: find the WORK that will be delivered, and copy what the document says about it. Do not calculate anything.

1. Find the scope of work.
   - It is the part that lists what will be built or delivered: modules, phases, stages, milestones, work packages, components, outputs, deliverables, or a timeline / effort / estimate table.
   - If the document has an explicit timeline, schedule or effort table, prefer it: use its rows as the modules and its durations.
   - If a block of work is described both in prose and in a table, use it once, not twice.

2. Ignore everything that is not work to be delivered:
   background, introduction, company profile, team and CVs, goals and principles, rules and policies, roles and permissions, technical stack, commercials, prices, payment terms, legal terms, risks, assumptions, open questions, decisions already made, status reports, instructions or templates for whoever fills in the form, and the table of contents.

3. "modules": the top-level blocks of work, in the document's order. Short names, without numbering ("Step 3:", "Module 2 -", "Phase 1:").

4. "features": the items of work inside each module (features, tasks, activities, sub-deliverables). Short names, under 120 characters; summarise long sentences. If a module lists no separate items, use the module itself as its single feature.

5. "duration": copy the duration EXACTLY as written for that feature or module, including the unit and any range, e.g. "3–4 days", "2 weeks", "1.5 months", "10 working days", "16 hours". Do not convert, add up or guess. If a duration is given only for the whole module, put it on the module's "duration" and leave the features without one. If no duration is written, leave it empty.

6. "foundIn": where you found it, briefly, e.g. "timeline table, page 9" or "section 2.3".

7. "statedTotal": the overall duration of the whole project exactly as written, if the document states one (e.g. "about 5–6 weeks", "36 months", "71 working days").

8. "startDate": the planned start as YYYY-MM-DD, only if a specific date is written.

9. "uatDuration": the client testing / UAT period exactly as written, only if stated.

10. "outOfScope": everything the document explicitly says is excluded or not included.

Never invent modules, features or durations. Return an empty "modules" list only if the document describes no work to be delivered at all.`

export const SCHEMA = {
  type: 'object',
  properties: {
    modules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          duration: { type: 'string', description: 'Exactly as written for the whole module, or empty' },
          foundIn: { type: 'string' },
          features: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                duration: { type: 'string', description: 'Exactly as written, e.g. "3–4 days", or empty' },
              },
              required: ['name'],
            },
          },
        },
        required: ['name', 'features'],
      },
    },
    statedTotal: { type: 'string' },
    startDate: { type: 'string', description: 'YYYY-MM-DD, only if stated' },
    uatDuration: { type: 'string' },
    outOfScope: { type: 'array', items: { type: 'string' } },
  },
  required: ['modules', 'outOfScope'],
}

const UNIT = [
  [/^(working\s+|business\s+|man[-\s]?|person[-\s]?)?(days?|d)$/, 1],
  [/^(working\s+)?(weeks?|wks?|w)$/, 5],
  [/^(working\s+)?(months?|mos?|m)$/, 22],
  [/^(hours?|hrs?|h)$/, 1 / 8],
  [/^(years?|yrs?)$/, 260],
]

// "3–4 days" -> 3.5, "2 weeks" -> 10, "1.5 months" -> 33, "16 hours" -> 2. Unknown -> null. Ranges use the middle.
export function toWorkingDays(text) {
  if (typeof text !== 'string') return null
  const t = text.toLowerCase().replace(/[–—−]/g, '-').replace(/\bto\b/g, '-').replace(/,/g, '.').trim()
  const m = t.match(/(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*([a-z][a-z\s-]*)?/)
  if (!m) return null
  const n = m[2] ? (+m[1] + +m[2]) / 2 : +m[1]
  const unit = (m[3] || 'days').trim().replace(/\s+(each|per\b.*|approx.*|approximately.*|of\b.*)$/, '').trim()
  const f = UNIT.find(([re]) => re.test(unit))
  if (!f || !(n > 0)) return null
  const d = Math.round(n * f[1] * 10) / 10
  return d > 0 && d <= 5000 ? d : null
}

// Never trust model output as-is: keep only well-formed parts, cap sizes, do the arithmetic here.
export function normalize(raw) {
  const text = (v, max = 200) => typeof v === 'string' ? v.trim().slice(0, max) : ''
  const warnings = []
  const modules = (Array.isArray(raw?.modules) ? raw.modules : []).slice(0, 60).map(m => {
    const features = (Array.isArray(m?.features) ? m.features : []).slice(0, 80)
      .map(f => ({ name: text(f?.name), durationText: text(f?.duration, 60), days: toWorkingDays(f?.duration) }))
      .filter(f => f.name)
    const modDays = toWorkingDays(m?.duration)
    // A duration given only for the whole module is spread over its features by count.
    if (modDays && features.length && !features.some(f => f.days)) {
      const each = Math.max(0.5, Math.round(modDays / features.length * 10) / 10)
      features.forEach(f => { f.days = each; f.fromModule = true })
    }
    return {
      // "Module 1: Inventory" -> "Inventory"
      name: text(m?.name).replace(/^(module|phase|stage|step|milestone|output|work package|wp|component|objective|deliverable)\s*\d+(\.\d+)*\s*[:.\-–]\s*/i, ''),
      durationText: text(m?.duration, 60),
      foundIn: text(m?.foundIn, 80),
      features,
    }
  }).filter(m => m.name && m.features.length)

  const all = modules.flatMap(m => m.features)
  const withDays = all.filter(f => f.days)
  const total = Math.round(withDays.reduce((a, f) => a + f.days, 0) * 10) / 10
  const statedTotal = text(raw?.statedTotal, 80)
  const stated = toWorkingDays(statedTotal)
  if (all.length && withDays.length < all.length) warnings.push(`Days were written for ${withDays.length} of ${all.length} items; the rest will be assumed.`)
  if (stated && total && withDays.length === all.length && (total > stated * 1.5 || total < stated / 1.5)) {
    warnings.push(`The items add up to ${total} working days, but the proposal states "${statedTotal}" (about ${stated} days). Check the days before drafting.`)
  }
  const unread = all.filter(f => f.durationText && !f.days)
  if (unread.length) warnings.push(`Could not read the duration of ${unread.length} item(s), for example "${unread[0].durationText}".`)

  return {
    modules,
    outOfScope: (Array.isArray(raw?.outOfScope) ? raw.outOfScope : []).map(x => text(x)).filter(Boolean).slice(0, 60),
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(raw?.startDate || '') && !isNaN(new Date(raw.startDate)) ? raw.startDate : null,
    uatDays: toWorkingDays(raw?.uatDuration),
    statedTotal: statedTotal || null,
    totalMonths: stated ? Math.round(stated / 22 * 10) / 10 : null,
    totalDays: total || null,
    warnings,
  }
}
