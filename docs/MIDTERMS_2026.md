# 2026 midterms guide

Pick a state → every federal race on its November 3, 2026 ballot plus the governor race, with the competitive ones flagged and each incumbent linked to their record on trackcongress. Launch list item: `docs/LAUNCH.md` → **2026 midterms**.

## Principles (Dylan, 2026-10-17)

- **Facts about past events, never opinions.** Who is on the ballot, which office they hold now, how incumbents voted and what they sponsored. No positions, no quotes from campaigns, no endorsements, no "key issues".
- **Every candidate in a race is treated the same.** Same fields, same layout. Candidates are sorted by last name, never by party or rating.
- **"Competitive" has one cited rule:** the race is rated Toss-up, Lean D or Lean R by [Sabato's Crystal Ball](https://centerforpolitics.org/crystalball/), recorded with the rating date. We use a forecaster rather than past margins because several states redrew their House maps for 2026, so 2024 margins don't describe the new districts.
- **We are not the ballot.** Each state links to its election office and its official sample-ballot or find-your-district lookup.

## Data

Typed TypeScript, one file per state: `shared/elections-2026/states/<STATE>.ts`, types in `shared/elections-2026/types.ts`. A state stays `status: 'pending'` (hidden in the UI) until it is fully compiled. `shared/elections-2026/guides.test.ts` enforces the shape for every non-pending state: every House seat once, ids, sources on every race and candidate, last-name order, incumbent ↔ `open_seat`.

Race ids: `PA-H-07`, `AK-H-00` (at-large), `GA-S`, `OH-S-SPECIAL`, `PA-GOV`.

### Compiling a state

1. **Races:** every House district, the Senate race if the state has one (Class 2 in 2026, plus specials: Ohio and Florida), the governor race if there is one. DC: the delegate race (district 0).
2. **Candidates:** everyone on the **general election** ballot for that office, from the state election office's certified candidate list when it is published; otherwise Ballotpedia, cross-checked with a second source. Include third-party and independent candidates who are on the ballot. Write-ins are left out.
3. **Per candidate:** `party` as the state prints it; `incumbent` only for this exact seat; `bioguide_id` for anyone serving in Congress now (any seat, e.g. a House member running for Senate); `current_office` only for a public office held now; `fec_candidate_id` from [FEC](https://www.fec.gov/data/) for federal races; `website` only for the official campaign site.
4. **Rating:** the current Crystal Ball rating, with the page URL and the day you checked it. Races Crystal Ball doesn't rate stay `rating: null`.
5. **`note`:** one factual line, only for unusual formats (top-two in CA and WA, ranked choice in AK and ME, Louisiana's system, a race with one candidate).
6. **Check before `status: 'compiled'`:** run `./node_modules/.bin/vitest run ../../shared/elections-2026` from `workers/senate_data_worker`. A second pass that re-checks every name and party against a different source moves the state to `verified`.

Nothing here is a guess. If a fact can't be sourced, leave the field null and say so in the PR.
