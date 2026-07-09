# Design agent orchestration — jzhao.xyz hypertext garden

Prompts for Composer 2.5 agents to redesign Congress Tracker in the style of [jzhao.xyz](https://jzhao.xyz) (Quartz v4 hypertext garden). Run in order; each agent should read `web/src/styles.css`, `web/src/components/`, and this file before editing.

Reference aesthetic: warm cream page (`#f5eedd`), navy headings, slate links, terracotta accents, flat square surfaces, Inter-only type (no second family), `#tag` chips, ornamental `* * *` dividers. No paper dot-grid, no card shadows.

---

## Agent 1 — Design tokens & global styles

**Model:** Composer 2.5  
**Scope:** `web/src/styles.css`, `web/tailwind.config.ts`, `web/index.html`

```
You are redesigning Congress Tracker to match jzhao.xyz / Quartz v4 hypertext garden aesthetics.

Read docs/DESIGN_AGENT_PROMPTS.md and inspect https://jzhao.xyz for inspiration.

Tasks:
1. Keep a single Google Fonts import: Inter only (weights 400/500/600/700, roman + italic). Do not add a second typeface.
2. Update CSS variables to Quartz palette:
   - background/light: #f5eedd
   - foreground/darkgray: #2d4673
   - heading/dark: #16294e
   - border/lightgray: #e3d9c0
   - muted/gray: #9a8e76
   - accent/tertiary: #c8482b
   - link/secondary: #284d78
   - pass: #09ad7a
3. Remove body dot-grid and gradient textures; use flat warm cream background.
4. Add utility classes: .garden-card, .garden-link, .garden-meta, .garden-tag, .garden-header, .garden-divider (ornamental hr with * * *).
5. Add :focus-visible rings (2px solid accent) on interactive elements.
6. Keep prefers-reduced-motion handling for flip cards.

Do not change React components. Run `npm --prefix web test` when done.
```

---

## Agent 2 — Layout & header

**Model:** Composer 2.5  
**Scope:** `web/src/App.tsx`, `web/src/routes/Home.tsx`

```
Redesign Congress Tracker header and page shell to feel like a personal hypertext garden (jzhao.xyz).

Read the token work in web/src/styles.css (garden-* classes).

Tasks:
1. Widen max container to ~680px readable column (jzhao article width feel).
2. Replace header-band/dossier kicker with garden-meta styling; add a welcome flourish in Inter (same family as body):
   <pre class="garden-welcome"><code>Welcome!</code></pre>
3. Use Inter at font-weight 400 for h1 (not semibold). Do not introduce a serif or mono companion font.
4. Intro copy: line-height 1.6rem, text-wrap pretty, max-width prose.
5. Add garden-divider ornamental hr between header and feed.
6. Footer: low-opacity meta line ("Flip cards for official CRS summaries ↗").

Preserve loading/error/empty states. Update Home.test.tsx selectors if class names change.
Run `npm --prefix web test`.
```

---

## Agent 3 — Feed rows & expand detail

**Model:** Composer 2.5  
**Scope:** `web/src/components/FeedRow.tsx`, `web/src/components/FeedRowDetail.tsx`

```
Implement the action-row feed (collapsed rows + inline expand detail).

Tasks:
1. Collapsed row: topic, event line (outcome + margin), optional teaser, status dot, expand affordance.
2. Expanded panel: vote history, digest sections, CRS in <details>, congress.gov link, policy/procedural chips.
3. One row open at a time; aria-expanded / aria-controls / aria-labelledby on the toggle.
4. Match design tokens (text-pass, text-fail, feed-list chrome) and FEED_REDESIGN_PLAN density targets.

Run `npm --prefix web test`.
```

---

## Agent 4 — Visual QA (Cursor browser)

**Model:** Composer 2.5  
**Scope:** local dev or preview URL

```
Visually QA Congress Tracker after the jzhao garden redesign.

1. Start dev: `npm run dev:web` (or open Cloudflare preview URL).
2. Use Cursor browser to capture screenshots at 390px and 1280px viewport.
3. Checklist:
   - Flat cream background (no dot grid)
   - Inter-only typography (h1 and body same family), readable body line-height
   - Terracotta tags with # prefix
   - Links slate → terracotta on hover
   - Ornamental * * * divider visible
   - Flip card animates; tap helper visible
   - Focus rings on keyboard tab through cards and links
   - Pass/fail vote colors distinguishable
4. File issues as a bullet list with severity (blocker / polish).

Do not commit screenshots to the repo.
```

---

## Agent 5 — Deploy preview

**Model:** Composer 2.5  
**Scope:** root `npm run preview`

```
Deploy a Cloudflare preview of Congress Tracker for design review.

1. Run `npm test` — fix any failures first.
2. Run `npm run preview` from repo root.
3. Paste the printed Preview URL into your response.
4. Fetch /health and /feed/latest.json on the preview host to confirm the worker serves the new UI.

Do not run `deploy` (production).
```

---

## Handoff checklist

- [ ] Tokens match Quartz/jzhao palette
- [ ] No paper texture or shadows on cards
- [ ] Tests pass (`npm test`)
- [ ] Browser QA complete
- [ ] Preview URL shared with user
