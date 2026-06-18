# Home feed redesign — Direction 1 (Action row)

Planning document for replacing large flip cards with a dense, scannable action-row feed. Use this spec when resuming implementation in a new Cursor Cloud session.

**Status:** Plan only — not yet implemented.

---

## Product intent (locked)

| # | Decision |
|---|----------|
| Q1 | The feed is an **action log** so users stay informed about **what Congress got done**, in plain English, with a **representation** lens (“what they did on my behalf”). |
| Q2 | **Passage outcome is Tier 1** — including failures. Every feed item is a passage-vote event. |
| Q3 | **AI digest = default reading layer**; **CRS / congress.gov = verification** on demand. Comprehension first, official text when drilling down. |
| Q4 | **Procedural votes stay in the feed**, but Tier 1 must **not** read as “policy passed.” |
| Q4b | **Framing B:** topic (issue) on line 1; **qualified** outcome on line 2. |
| Q5 | Do not repeat “119th Congress” on every row; bill id (e.g. H.R. 2913) is enough. Site header carries session context. |

---

## Problem with current UI

- Front face leads with headline + long summary (up to 600 chars); vote outcome is **behind a flip**.
- For “what got done,” that order is backwards.
- Mobile disables line clamps — cards grow very tall.
- Redundant layers: headline + `what_it_does` + key points + CRS often repeat the same job.
- Procedural classification can disappear when a digest exists (`isProcedural` tied to missing digest headline).

---

## Design direction

**Direction 1: Action row** — dense list, not large floating cards. No 3D flip.

**Target density:** ~3–4 collapsed rows above the fold on iPhone SE (320px), vs ~1 card today.

---

## Information tiers

| Tier | Content | Where |
|------|---------|--------|
| **1** | Outcome + chamber + margin + date (+ procedural qualifier) | Collapsed row, line 2 |
| **1b** | Topic headline (plain) | Collapsed row, line 1 |
| **2** | One-line teaser (`what_it_does`, ~120 chars) | Collapsed row, line 3 (optional) |
| **3** | Full votes, key points, terms, CRS, congress.gov | Expanded detail only |

**Remove from scan surface:** flip hints, 600-char preview, full CRS, “119th Congress” per row, vote info hidden until interaction.

---

## Collapsed row spec

```
[●]  {topic headline}                              {date}  [›]
     {event line}
     {optional 1-line teaser}
```

### Line 1 — Topic

- **Source priority:** `digest.headline` → procedural rewrite (`proceduralHeadline`) → trimmed `bill.title` → docket
- **Style:** `text-base font-semibold`, `line-clamp-2`
- **Framing B:** issue-first (especially for procedural rows)

### Line 2 — Event (Tier 1)

Use **primary vote** = latest `passage_votes[]` by `date`.

**Substantive pass:**

```
Passed · Senate · 52–47 · H.R. 2913
```

**Substantive fail:**

```
Failed · House · 198–230 · H.R. 8428
```

**Procedural (framing B — qualifier on this line):**

```
Procedural · House agreed 218–210 · debate rule for H.R. 2913
Procedural · House rejected 198–230 · rule for H.R. 456
```

Never show procedural rows as bare **“Passed”** without the `Procedural ·` qualifier.

### Line 3 — Teaser (optional)

- **Source:** `digest.what_it_does`
- **Rule:** 1 line, ~120 chars (`line-clamp-1`)
- If no digest: omit or show faint “Summary pending”; do not put long CRS on collapsed row

### Status dot (left gutter)

| Kind | Dot | Derived from |
|------|-----|--------------|
| Substantive passed | Green (pass color) | Latest vote result |
| Substantive failed | Red (fail color) | Latest vote result |
| Procedural | Neutral / dashed | Title/vote type |

Dot is decorative; event line text is accessible source of truth (`aria-hidden` on dot).

### Right column

- **Date:** `latest_passage_date` via `formatVoteDate`
- **Chevron:** expand affordance; whole row tappable except external links

### Meta

- Bill id on event line (not “119th Congress”)
- Policy chip: optional on collapsed row; can move to expanded detail to save width
- **Procedural chip:** always when procedural (in addition to event line qualifier)

---

## Expanded detail spec

Inline accordion on row tap — **not** 3D flip, **not** new route in v1.

1. **Vote history** — all `passage_votes`, split bars, chamber / date / result
2. **What it does** — full `digest.what_it_does`
3. **Key points** — `digest.key_points`
4. **Terms explained** — `digest.terms_explained` (in data model today but not surfaced in UI)
5. **Official CRS summary** — `<details>` collapsed by default; `raw_summary_text`
6. **congress.gov ↗** — `stopPropagation` on click

**Interaction defaults:**

- **List chrome:** single bordered container wrapping all rows
- **Teaser:** 1-line clamp on all breakpoints when digest exists
- **Expand:** one row open at a time (simplest; all breakpoints)

**Reduced motion:** no 3D transform; expand via height/opacity; instant when `prefers-reduced-motion`.

---

## Example rows

### Substantive pass

```
[●]  Ukraine security assistance                        Jun 5  [›]
     Passed · Senate · 52–47 · S. 2
     Authorizes military aid and oversight for partner nations.
```

### Substantive fail

```
[●]  Rural hospital funding                              Jun 4  [›]
     Failed · House · 198–230 · H.R. 8428
     Extends Medicare payments to rural facilities.
```

### Procedural (framing B)

```
[○]  Ukraine security assistance                        Jun 4  [›]
     Procedural · House agreed 218–210 · debate rule for H.R. 2913
     Sets floor debate terms for the underlying bill.
```

---

## Visual system

| Token | Value | Notes |
|-------|-------|-------|
| List | Single `rounded-lg border bg-card` container | Rows use `divide-y` |
| Row padding | `py-3 px-3` | Down from `p-6` / `p-7` |
| Skeleton | ~64px height × 3 rows | Down from 260px cards |
| Topic | `text-base font-semibold` | Down from 19px |
| Event line | `text-sm`; outcome word `font-medium` + pass/fail color | |
| Teaser | `text-sm text-secondary line-clamp-1` | Optional |
| Home list spacing | Replace `space-y-5` card stack with one list | |

---

## Architecture

### New files

| File | Purpose |
|------|---------|
| `web/src/utils/feedRowLabels.ts` | Topic, event line, procedural detection, primary vote, teaser |
| `web/src/utils/feedRowLabels.test.ts` | Unit tests for copy rules |
| `web/src/components/FeedRow.tsx` | Collapsed row + expand state |
| `web/src/components/FeedRowDetail.tsx` | Expanded panel |
| `web/src/components/FeedRow.test.tsx` | Component + a11y tests |

### Proposed `feedRowLabels.ts` exports

```ts
isProceduralFeedItem(item: FeedItem): boolean  // title patterns; NOT "has digest"
getFeedTopic(item: FeedItem): string
getPrimaryPassageVote(item: FeedItem): FeedPassageVote | null
getFeedEventLine(item: FeedItem): string
getFeedStatusKind(item: FeedItem): 'passed' | 'failed' | 'procedural'
getFeedTeaser(item: FeedItem): string | null
```

**Fix vs current `FeedCard`:** `isProceduralFeedItem` must use `proceduralHeadline(item.bill.title)` (or equivalent title patterns), **independent of whether `digest.headline` exists**.

### Remove after migration

| File | Reason |
|------|--------|
| `web/src/components/FeedCard.tsx` | Replaced by `FeedRow` |
| `web/src/components/FlipCard.tsx` | No flip interaction |
| `web/src/components/FeedCard.test.tsx` | Replaced by `FeedRow.test.tsx` |
| `web/src/components/FlipCard.test.tsx` | No longer needed |
| `.flip-card*` rules in `web/src/styles.css` | ~250 lines |

### Update

| File | Changes |
|------|---------|
| `web/src/routes/Home.tsx` | Render `<ul className="feed-list">` of `FeedRow`; lighter skeleton |
| `web/src/routes/Home.test.tsx` | Outcome visible on load; no flip hints; list semantics |
| `web/src/styles.css` | Add `.feed-row*`, `.feed-list*`; remove flip styles |
| `scripts/qa-web-viewports.mjs` | Selectors: `.feed-row`, topic element; remove flip-card checks |
| `web/src/utils/billLabels.ts` | Keep shared formatters; feed-specific logic lives in `feedRowLabels.ts` |

Reuse from `billLabels.ts`: `formatBillDocket`, `formatVoteDate`, `proceduralHeadline`, `voteResultClass`, `billDidNotPass`, `congressGovBillUrl`, `trimDisplayTitle`.

---

## Accessibility

- Row: `<article aria-labelledby={topicId}>`
- Expand: `aria-expanded`, `aria-controls` on panel; row or button with label “Show details for {topic}”
- CRS block: `<details>` or region with `aria-label="Official CRS summary"`
- congress.gov link does not toggle expand

---

## Edge cases

| Case | Collapsed behavior |
|------|-------------------|
| No digest yet | Topic from procedural rewrite or trimmed title; teaser omitted or “Summary pending” |
| Failed votes | Red dot + `Failed · …` on event line (avoid duplicating “Did not pass” pill + event line unless pill adds clarity) |
| Procedural + digest | Topic may use digest headline if it describes underlying issue; event line **always** includes `Procedural ·` |
| Multiple chamber votes | Tier 1 from latest vote; all votes in expanded detail |
| Zero passage votes | Faint row; event line “No vote recorded” |
| Long headline | `line-clamp-2` on topic |

---

## Implementation phases

### Phase 1 — Collapsed rows

- Add `feedRowLabels.ts` + tests
- Add `FeedRow` (collapsed only)
- Swap `Home` to list of `FeedRow`
- Update `Home.test.tsx` and QA selectors (partial)

**Exit criteria:** `npm test` green; topic + outcome visible without expand; rows visibly smaller than flip cards.

### Phase 2 — Expand detail

- Add `FeedRowDetail` + accordion a11y
- Port vote split bar, key points, terms, CRS from old `FeedCard` back face
- CRS in collapsed `<details>` by default

**Exit criteria:** Feature parity with old back face; no CRS / full votes on collapsed row.

### Phase 3 — Cleanup

- Delete `FeedCard`, `FlipCard`, old tests
- Remove `.flip-card*` CSS
- Remove front-card usage of `SUMMARY_PREVIEW_MAX_CHARS` if unused
- Full QA script update

**Exit criteria:** No `flip-card` references under `web/`; `npm run qa:web` 8/8.

### Phase 4 — Ship checklist (required for `web/` changes)

Per root `AGENTS.md`:

1. `npm test`
2. `npm run dev:web` then `npm run qa:web`
3. Thermonuclear review on branch diff; fix CRITICAL/WARNING until clear
4. `npm run preview` — paste Preview URL in PR
5. Include QA results, review outcome, and preview URL in PR description

---

## Test checklist

### Unit (`feedRowLabels.test.ts`)

- [ ] Substantive pass / fail event lines
- [ ] Procedural agreed / rejected lines (framing B)
- [ ] Procedural item **with digest** still classified procedural
- [ ] Primary vote = latest date
- [ ] Teaser length cap

### Component (`FeedRow.test.tsx`)

- [ ] Topic + event visible without expand
- [ ] `Passed` / margin on collapsed surface (inverts old “hidden until flip” behavior)
- [ ] Expand reveals CRS; collapsed does not
- [ ] congress.gov click does not toggle expand
- [ ] Procedural row shows `Procedural ·` on line 2

### Integration (`Home.test.tsx`)

- [ ] Feed renders as list
- [ ] No “Flip for vote details”
- [ ] Outcome visible on initial load

### Viewport QA (`qa-web-viewports.mjs`)

- [ ] Replace `.flip-card` → `.feed-row`
- [ ] Headline/topic selector updated (e.g. `[data-feed-topic]`)
- [ ] Remove flip-hint / flip-card-inner / front-scroll checks
- [ ] Collapsed row height sanity (e.g. `< 120px` on mock item)
- [ ] Event line visible without expand

---

## Out of scope (v1)

- Date grouping headers (timeline layout)
- Bill detail route (`/bill/:congress/:type/:number`)
- “My reps” vote personalization
- API / worker payload changes
- Desktop two-column feed

---

## Success criteria (qualitative)

- [ ] Pass/fail + margin visible without interaction
- [ ] Procedural rows cannot be read as “policy passed”
- [ ] ≥3 mock rows fit in 320×568 viewport above fold (with site header)
- [ ] CRS + full vote list only after expand
- [ ] All existing `FeedItem` fields still reachable in UI

---

## Suggested PR strategy

**Option A — one PR:** Phases 1–3 together.

**Option B — two PRs:**

1. `feedRowLabels` + collapsed `FeedRow` + Home swap + test/QA updates
2. Expand detail + delete FlipCard/FeedCard + CSS cleanup

---

## Related code (current)

- Feed route: `web/src/routes/Home.tsx`
- Current card: `web/src/components/FeedCard.tsx` → `FlipCard.tsx`
- Label helpers: `web/src/utils/billLabels.ts`
- Feed types: `web/src/api/types.ts`, `shared/` worker types
- Viewport QA: `scripts/qa-web-viewports.mjs`

---

## Open decisions (defaults assumed above)

Override before implementation if needed:

1. **List chrome:** single bordered container ✓ (default)
2. **Teaser line:** show 1-line clamp on all breakpoints when digest exists ✓ (default)
3. **Expand:** one row open at a time ✓ (default)
