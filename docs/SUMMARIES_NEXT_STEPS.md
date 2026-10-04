# Plain-language summaries: handoff and next steps

Updated 2026-10-04 late (PRs #217–#230 across three sessions) on top of the 2026-09-27 handoff at the end of the session that shipped PRs #210–#216 (all merged, all deployed). The earlier version of this file (from the session that built the pipeline, #200–#209) was corrected where it was wrong; see "Corrections" below.
**First: `git fetch && git pull` on `main`.**

## Read first

- `AGENTS.md` → **Plain-language summaries**: the whole pipeline (prompt, models, checks, queue, budget, AI Gateway, feedback, backfill, evals, judge).
- `docs/MONITORING.md`: what the hourly sweep logs and what to watch.
- `workers/senate_data_worker/src/digest/`: the writer. `prompt.ts` (v3.3, `PROMPT_EPOCH` v3), `checks.ts`, `bill-text-parse.ts`, `write.ts`, `prepare.ts`.
- `workers/senate_data_worker/src/pipeline/run-summary-sweep.ts`: the hourly sweep (cron `35 * * * *`).
- `scripts/digest-eval/`: the eval harness. Saved outputs now live in `artifacts/digest-eval/` in the main checkout (moved out of the old `ct-toolbar` worktree).

## How Dylan wants work done

- **One fix per PR.** Every PR gets a subagent review (this session: Opus 5.5) before merge. Fix what it finds, record the review in the PR body, then merge. Dylan doesn't review PRs himself.
- **Stick to the agreed plan.** Anything that spends real money or changes what readers see goes to Dylan first. He approved: ~$0.25 for one eval round (spent $0.20) and ~$0.50 to refresh the voted-bill summaries (see "Blocked" below).
- **Keep API cost down.** Luna through the OpenRouter Batch API for new bills; Sonnet on the normal API only for bills that matter. Unchanged inputs cost nothing.
- **Headlines are about the change, never the vote.**
- **Prompt changes need an eval round before merge.** Round, `regress.mjs`, then the judge. A minor prompt change bumps `PROMPT_VERSION` only; bump `PROMPT_EPOCH` only when Dylan wants stored summaries rewritten.
- **Delete dead code whenever you find it.** (Dylan, 2026-09-27.)
- **Commit before a mutation check that ends in `git checkout <file>`.**
- **Worktrees: never `git add -A` with symlinked `node_modules`/`artifacts`.** Fixed in #216 (`.gitignore` now ignores them as symlinks too), but stage explicitly anyway. Run `git ls-tree -r HEAD | awk '$1=="120000"'` before pushing.
- **`npm run <script>` exits 194 with no output in some shells here.** Call the binaries directly: `./node_modules/.bin/vitest`, `./node_modules/.bin/tsc`, `node --no-warnings scripts/digest-eval/regress.mjs <round>`, `node scripts/preview-upload.mjs`.

## Shipped this session (2026-09-27)

| PR | What | Why |
| --- | --- | --- |
| #211 | `<term>` in bill XML is rendered as quotes; defined-term exemption accepts plural forms | The exemption never fired on real bills (Congress.gov marks definitions with `<term>`, not quotes). HR 10395 was falsely blocked. |
| #210 | Checks scan `who_it_affects` for numbers and judging words; citations stripped per field | The field with most judge failures was never checked. |
| #212 | "dirty" and "polluting" are judging words | Both models wrote them for HR 2140. |
| #215 | Prompt v3.3: groups must come from the sources; recurring deadlines stated as recurring; disapproval resolutions get "Resolution would cancel…" headlines; dirty/polluting in the prompt list | Round 5: Luna 10/10 (was 9/10), Sonnet 7/10 (was 8/10, n=10, extra failure unrelated). Deadline and vote-headline fixes confirmed. |
| #214 | Notable-votes UI, `/stats/notable.json`, its analytics and synthesis code removed (−2315 lines) | Unmounted since #163. |
| #213 | Footer says summaries are model-written from the bill text (or title/CRS before text), screened for numbers and wording; CRS summary available beneath | Dylan: "tasteful, footer only". |
| #216 | Untracked three symlinks committed by mistake in #211; `.gitignore` fixed | Pulling main had replaced the main checkout's real `node_modules` with self-links. |

Also: stale PRs #184, #188–#191 closed. Nine merged worktrees removed. HR 10395 rewritten on v3.3 (Sonnet, $0.02): "Pilot program tests funding tools for mineral processing plants", groups "critical mineral processing companies…" — the exemption works in production.

## Also shipped 2026-10-04, later

| PR | What |
| --- | --- |
| #228 | Dropped the orphaned `idx_bill_committee_events_committee` index (schema v16 with a migration and a real-sqlite test). |
| #229 | "extreme cold / heat / weather / temperatures / wind chill" are weather terms of art, not judging words. HR 3106 had parked three times on it. Refreshed on v3.4 afterwards: "Bill would require drill for terrorist attack during extreme cold". |
| #230 | Batch spend is charged to the submit day, so a batch collected after midnight corrects the right day. |

The refresh loop ran: all 33 voted-bill summaries still on v3 (plus HRES518) are on v3.4 now, ~$0.52, no failures. Every rewrite-tier summary on the site is v3.3 or v3.4; every bill on the site has a summary; the site backfill is finished (234 done, 0 queued).

## Tracker (keep this current)

| When | What | Who |
| --- | --- | --- |
| Daily, 2 min | Spend vs $2; `SELECT bill_type||number, last_error FROM digest_jobs WHERE last_error LIKE 'parked%'` (new parkings carry the reason); `SELECT kind, count(*) FROM digest_feedback GROUP BY kind` | Dylan or agent |
| ~2026-10-18 | Feedback decision: two weeks after #224. Keep, move, or remove based on rows. | Dylan |
| Next eval round | Spot-check a whereas-heavy resolution (rule 4 and the two v3.4 wording tightenings were added after round 6). Evidence collected for v3.5: one Title Case headline (HR 9340), inconsistent capitalization in who_it_affects, Sonnet "U.S. voters" on HJRES1, one tense miss. | agent, ~$0.25, needs Dylan's yes |
| When Dylan says | Full-Congress backfill, ~$20, key cap $15. Declined for now. | Dylan |
| Open parked bills | HR10217, S5422 (county totals: v3.4 rule, un-park by refresh when a text change re-queues them, or refresh by hand ~$0.02 each), HR10367 (unknown; next parking carries the reason), S5579, S5648, HRES1585 (title-only or correctly blocked; the sweep re-checks them when text arrives). | sweep |
| Small follow-ups | `backfillHasBudget` reads the wall clock (share can drift one run across midnight); feedback cap 30/day is per egress IP; proper-name rule also admits Title Case framing in preambles. | agent, when convenient |

## Shipped 2026-10-04 (all merged, Opus 5.5 reviewed, deployed)

| PR | What | Why |
| --- | --- | --- |
| #221 | Resolution preambles (whereas clauses) reach the writer and the checks, as a PREAMBLE block | HRES1585 saw 59 tokens and no date. Parser only; the prompt clause went into v3.4. |
| #222, #223 | `/stats/pulse.json` and `/stats/committees.json` removed with their types, analytics and seed rows (−965 lines) | Unused by web since #163. |
| #224 | "Was this clear? Yes / No" under "What it does" (below the caption on title-only summaries), 32px targets, failed posts logged once per session and counted in sessionStorage; Yes/No grouped and labelled | Zero feedback rows in a week; the row was below the fold of an expanded row. Preview accepted a real vote with 200. Decide on the data in two weeks. |
| #225 | Prompt v3.4: never count a list yourself; affected groups are people or businesses, never the implementing agency; "Law cancels…" for enacted disapproval resolutions; findings and whereas clauses attributed and never leading the headline | Round 6 ($0.27): Luna 10/10, no county totals, no agencies. Sonnet's county totals are blocked by the checks and the retry goes to Luna. A stricter groups judge was tried and NOT adopted: it fails "California regulators", a group in Dylan's round-2 pick. |
| #226 | Budget checked before every paid call (first try, fallback, each long-bill part slice, each combine); over budget leaves the job queued with "budget: $x left, needs ~$y", never parked; a try is handed back only when nothing was sent; `costUsd` reports both charges on a double rejection; Sonnet direct price $2/$10 | Audit items from 2026-09-27. |
| #227 | Every direct call records its estimate before it goes out; the answering attempt settles to actual; estimates are taken back only on 4xx refusals, never 408 or 5xx; `recordSpend` is one atomic upsert; the UTC day is pinned per call | A billed timeout retry and a worker kill mid-call were never recorded. |

Still for Dylan to run: the v3 → v3.4 refresh loop for the 30 voted-bill summaries plus HRES518 (see "Needs Dylan to run"). Open from the reviews: the `idx_bill_committee_events_committee` index has lost its query; a batch collected after midnight corrects on the collect day; the feedback cap of 30/day is per egress IP.

## Shipped 2026-10-03 (all merged, Opus 5.5 reviewed, deployed)

| PR | What | Why |
| --- | --- | --- |
| #217 | `DIGEST_DAILY_BUDGET_USD = "2"` in `[vars]` (was the $1 default) | Spend hit $1 on four of seven days; the live lane writes 200+ new bills a day while the floor is quiet and starved the backfill. |
| #218 | Parked bills keep their last rejection reason: `parked after 3 failed attempts (last: rejected: …)`; all three parking paths consistent and counted | Nine bills parked in the week with the reason overwritten; nobody could tell checker bugs from real blocks. |
| #219 | Terms of art ("critical health care personnel", "historic preservation/sites/records/trails/…") and proper names that appear verbatim in the bill are not judging words | S.5406 (statutory category from 38 U.S.C. 7431), S.790 ("National Historic Trails Interpretive Center"), HR 7618, S.5579 all parked on these. Two review rounds closed real holes; see the PR body for the exact rule. |
| #220 | `numbersIn` reads spelled-out ordinals ("thirtieth consecutive day" → 30) | HR 10422 parked because "30 straight days" had no support. |

### Parked bills, triaged (read-only investigation 2026-10-03)

- Fixed by #219/#220, **need a refresh to un-park** (parking waits for the bill to change): S5406, HR7618, S790, HR10422, S5579.
- Still correctly blocked: HR5366 ("2015" not in bill), S5648 (title-only, "critical decisions" is the sponsor's framing), HRES1585 (bare "historic," in the resolving clause; also the preamble is dropped, see next steps).
- Number counts the writer derived (HR10217 "35 counties", S5422 "17 counties"): a prompt problem, not a checker one; see next steps.
- HR10367 (28k tokens, no CRS): cause unknown; the next parking will carry the reason thanks to #218.

## Corrections to the previous handoff

- **Step 3 (notable-bill sheet) was wrong.** Nothing mounted it since #163. Deleted instead (#214).
- **HR 10395 was not fixed by #206.** The exemption needed quotes that real XML never produces. Fixed in #211. S.5384 was genuinely fixed by #206.
- **"Retries when the backfill resumes" was loose.** A rejected try goes back to `queued` with `attempts` kept; a bill parks at 3 attempts on the same fingerprint (`DIGEST_MAX_ATTEMPTS`), and a fixed checker never un-parks it. HR 5366 is at attempt 1 and will be paid for up to twice more.
- **Dylan's headline ruling was not in front of readers.** A version bump never rewrites stored summaries; five voted bills still lead with "House votes to…" (see Blocked).

## Current state (2026-09-27 ~16:40 UTC)

- **Production:** trackcongress.org on main `2532cdd`. Prompt v3.3. Budget `DIGEST_DAILY_BUDGET_USD` $2/day since 2026-10-03 (#217; was the $1 default).
- **OpenRouter key:** limit $15, usage $0.20, $14.80 remaining (`GET https://openrouter.ai/api/v1/key`). Not close to running out.
- **Site backfill (2026-10-03):** 173 done, 61 queued; the live lane wrote 200–275 summaries a day this week (624 v3.3 new-tier summaries). **Do not start `scope=congress`** without Dylan.
- **Rejected/parked:** see the triage above. HR10395 and S5384 were rewritten on 2026-09-27.
- **Ingest health is "degraded":** `Intro discovery soft-failed: Intro list failed: Unexpected end of JSON input` on the 10:00 UTC run (Congress.gov returned an empty body; everything else succeeded). Watch whether it repeats tomorrow.
- **Local:** `/Users/dylanfdl/Projects/ct-toolbar` is a deregistered, half-removed worktree directory (source files and `node_modules`; nothing uncommitted). Delete it by hand: `rm -rf /Users/dylanfdl/Projects/ct-toolbar`. The main checkout's old `artifacts/` (Sep 1 QA screenshots) was overwritten by the symlink pull; the eval artifacts are intact and now live in `congress-tracker/artifacts/digest-eval`.

### Useful commands

Run from `workers/senate_data_worker`. `PIPELINE_ADMIN_TOKEN` is in `.dev.vars`. Use `./node_modules/.bin/wrangler`.

```bash
# Queue and spend
./node_modules/.bin/wrangler d1 execute congress-tracker --remote --command "SELECT origin, state, count(*) FROM digest_jobs GROUP BY origin, state"
./node_modules/.bin/wrangler d1 execute congress-tracker --remote --command "SELECT key, value_json FROM pipeline_state WHERE key LIKE 'digest_spend:%' ORDER BY key DESC LIMIT 3"
# Rejections and parked bills
./node_modules/.bin/wrangler d1 execute congress-tracker --remote --command "SELECT bill_type||number, attempts, last_error FROM digest_jobs WHERE last_error LIKE 'rejected%' OR last_error LIKE 'parked%'"
# Summaries by prompt version
./node_modules/.bin/wrangler d1 execute congress-tracker --remote --command "SELECT json_extract(digest_json,'$.generator.prompt_version') pv, json_extract(digest_json,'$.generator.tier') tier, count(*) FROM bill_digests GROUP BY pv, tier"
# Rewrite one bill now (Sonnet, ~$0.02)
curl -X POST -H "Authorization: Bearer $TOKEN" "https://congress-tracker-api.fernandezdelaradylan.workers.dev/__pipeline/run/digest-refresh?bill=HR4795"
```

## Needs Dylan to run

Nothing right now. Both refresh loops have run (2026-10-04). Agent permissions sometimes refuse batches of admin POSTs; when that happens the command is written here for Dylan to paste with `!`.

## Next steps

1. **Run the refresh loop** (30 voted bills + HRES518) and the daily check: spend against $2, parked reasons (`last_error LIKE 'parked%'` now carries the cause), feedback rows (`SELECT kind, count(*) FROM digest_feedback GROUP BY kind`).
2. **Feedback decision, ~2026-10-18:** two weeks after #224. Keep, move, or remove based on rows.
3. **Prompt v3.5 only with evidence.** Rule 4 (preambles) and the two v3.4 wording tightenings were added after round 6 ran; spot-check a whereas-heavy resolution in the next round. Known Sonnet quirks: "U.S. voters" on H.J.Res. 1, one tense miss ("Creates Kentucky Wildlands…").
4. **Judge:** keep the calibrated Gemini judge. If groups need stricter judging, re-calibrate against Dylan's picks first (~$0.05 to re-judge the five picks).
5. **Small follow-ups:** drop the orphaned `idx_bill_committee_events_committee` index; pin the batch day at submit; the proper-name exemption (#219) also applies to Title Case framing in preambles (lowercase framing still blocks).
6. When the site backfill finishes, ask Dylan about `scope=congress` (~$20; key cap $15). He declined it on 2026-10-04 for now.

### Later

- Vote-outcome consistency check (body says "passed" when the last vote failed).
- Feedback into AI Gateway via `generator.gateway_log_id`.
- dfdl-ui domain: buy it on Cloudflare at the very end (Dylan's list).
