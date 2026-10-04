# Plain-language summaries: handoff and next steps

Updated 2026-10-03 (second session, PRs #217–#220) on top of the 2026-09-27 handoff at the end of the session that shipped PRs #210–#216 (all merged, all deployed). The earlier version of this file (from the session that built the pipeline, #200–#209) was corrected where it was wrong; see "Corrections" below.
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

## Needs Dylan to run (agent permissions refuse batches of admin POSTs)

Budget is $2/day now, so both loops fit in one day with headroom. Each call is one Sonnet write, ~$0.01–0.02.

```bash
cd workers/senate_data_worker && TOKEN=$(grep PIPELINE_ADMIN_TOKEN .dev.vars | cut -d= -f2-)
# Un-park the bills #219/#220 fixed:
for b in S5406 HR7618 S790 HR10422 S5579; do curl -s -X POST -H "Authorization: Bearer $TOKEN" "https://congress-tracker-api.fernandezdelaradylan.workers.dev/__pipeline/run/digest-refresh?bill=$b"; echo; done
# The 30 rewrite-tier summaries still on prompt v3 (list them live, then loop):
./node_modules/.bin/wrangler d1 execute congress-tracker --remote --command "SELECT bill_type||number FROM bill_digests WHERE json_extract(digest_json,'$.generator.tier')='rewrite' AND json_extract(digest_json,'$.generator.prompt_version')='v3'"
# plus HRES518 (pre-v3, headline "House Votes on Support for Ukraine").
```

## Next steps

1. **Run the two loops above**, then check `SELECT bill_type||number, attempts, last_error FROM digest_jobs WHERE last_error LIKE 'parked%'` the next day: with #218 every new parking says why.
2. **Resolutions lose their preamble.** `billBodyXml` starts at `<resolution-body>` and drops `<preamble>`, so the writer never sees the whereas clauses (HRES1585 saw 59 tokens and no date). Keep the preamble as findings context. Sources change, not prompt; the fingerprint ignores text, so no rewrites. One PR.
3. **Prompt v3.4 candidates** (need an eval round, ~$0.20): "don't total an unnumbered list (counties, agencies) unless the text gives the number" (HR10217, S5422); "the people or businesses it requires…, never the agency that carries it out"; the enacted disapproval-resolution tense example. The judge is more lenient on groups than the prompt (`judge.mjs:67`).
4. **Budget robustness** (cents): `writeSummary` checks the budget once before up to two calls; the long-bill combine never checks; batch estimate assumes 4k output tokens vs Luna's 12k max; a timeout retry in `openrouter-client.ts` can bill twice and record never; `costUsd` drops the second model's charge on a double rejection.
5. **Reader feedback** is still zero after a week. Make the row visible on the collapsed card or drop it; test the endpoint end to end once.
6. **Daily check:** spend against $2, backfill (61 queued on 2026-10-03), parked reasons, feedback. When the site backfill finishes, ask Dylan about `scope=congress` (~$20, key cap $15 today).

### Later

- Vote-outcome consistency check (body says "passed" when the last vote failed).
- Feedback into AI Gateway via `generator.gateway_log_id`.
- dfdl-ui domain: buy it on Cloudflare at the very end (Dylan's list).
