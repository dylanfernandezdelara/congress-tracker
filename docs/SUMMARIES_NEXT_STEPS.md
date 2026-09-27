# Plain-language summaries: handoff and next steps

Updated 2026-09-27 ~16:40 UTC at the end of the session that shipped PRs #210–#216 (all merged, all deployed). The earlier version of this file (from the session that built the pipeline, #200–#209) was corrected where it was wrong; see "Corrections" below.
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

## Corrections to the previous handoff

- **Step 3 (notable-bill sheet) was wrong.** Nothing mounted it since #163. Deleted instead (#214).
- **HR 10395 was not fixed by #206.** The exemption needed quotes that real XML never produces. Fixed in #211. S.5384 was genuinely fixed by #206.
- **"Retries when the backfill resumes" was loose.** A rejected try goes back to `queued` with `attempts` kept; a bill parks at 3 attempts on the same fingerprint (`DIGEST_MAX_ATTEMPTS`), and a fixed checker never un-parks it. HR 5366 is at attempt 1 and will be paid for up to twice more.
- **Dylan's headline ruling was not in front of readers.** A version bump never rewrites stored summaries; five voted bills still lead with "House votes to…" (see Blocked).

## Current state (2026-09-27 ~16:40 UTC)

- **Production:** trackcongress.org on main `2532cdd`. Prompt v3.3. Budget `DIGEST_DAILY_BUDGET_USD` $1/day; today's spend ~$0.89 before the blocked refreshes.
- **OpenRouter key:** limit $15, usage $0.20, $14.80 remaining (`GET https://openrouter.ai/api/v1/key`). Not close to running out.
- **Site backfill:** 78 of 300 done, 222 queued; resumes 00:00 UTC. **Do not start `scope=congress`** without Dylan.
- **Rejected/parked:** HR5366 (attempt 1, correct block: "2015" not in bill), S5384 (attempt 2, fixed by #206, gets its last try tonight), HR10395 (now rewritten, done).
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

## Blocked: needs Dylan to run

**Refresh the voted-bill summaries to v3.3.** Dylan approved the spend; the agent's tool permissions refused the batch of admin POSTs. Each call is one Sonnet write, ~$0.02. Today's budget is nearly used ($0.89 of $1), so the refresh may refuse after a few bills until 00:00 UTC; run the six vote-headline bills first, the rest tomorrow.

```bash
cd workers/senate_data_worker && TOKEN=$(grep PIPELINE_ADMIN_TOKEN .dev.vars | cut -d= -f2-)
# Vote-style headlines (Dylan's ruling), plus S.5384 which sits on a title fallback:
for b in S5384 HJRES213 HJRES210 HCONRES89 HCONRES93 HRES1498 HJRES1; do curl -s -X POST -H "Authorization: Bearer $TOKEN" "https://congress-tracker-api.fernandezdelaradylan.workers.dev/__pipeline/run/digest-refresh?bill=$b"; echo; done
# The other 32 rewrite-tier summaries still on v3 (tomorrow, ~$0.65):
for b in HR1276 HR1501 HR2069 HR2140 HR2196 HR2978 HR3276 HR4219 HR4646 HR4795 HR8278 HR9340 HR9436 HR9497 HR9500 HR9576 HR10326 HR10511 HR10516 HR10517 HR10593 HRES1490 HRES1499 HRES1530 S32 S307 S723 S2403 S5447 S5449 S5483 S5490 S5493; do curl -s -X POST -H "Authorization: Bearer $TOKEN" "https://congress-tracker-api.fernandezdelaradylan.workers.dev/__pipeline/run/digest-refresh?bill=$b"; echo; done
```

## Next steps

1. **Run the blocked refresh above** and spot-check the six new headlines.
2. **Prompt v3.4 candidates** (from the #215 review; not applied because they weren't in the eval round): "the people or businesses it requires…, never the agency that carries it out" (Sonnet listed "the EPA" once); the disapproval-resolution headline example should follow the TENSE rule for enacted ones ("Law cancels…"); Sonnet still writes "U.S. voters" for H.J.Res. 1 (a constitutional-amendment rule would fix one bill; probably not worth it). The judge is more lenient on groups than the prompt now is (`judge.mjs:67`), so it under-counts violations.
3. **Budget robustness** (cents, from the audit): `writeSummary` checks the budget once before up to two calls; the long-bill combine never checks it; the batch estimate assumes 4k output tokens while Luna's max is 12k; a timeout retry in `openrouter-client.ts` can be billed twice and recorded never; the reported `costUsd` drops the second model's charge on a double rejection.
4. **Retry semantics:** consider re-queuing parked bills once when the checker changes (today they wait for the bill to change or an epoch bump).
5. **Reader feedback** is live but buried (12px links under an expanded row, fire-and-forget POST with no error surfaced). Zero rows so far. If you want signal, make it visible or log client failures.
6. **`/stats/pulse.json`** (and `close_votes`) has been unused by web since #163. Delete it the way #214 deleted notable.
7. **Check production daily:** backfill progress and spend, rejections (read the bill before calling a block false), feedback rows, the intro-discovery warning. When the site backfill finishes, ask Dylan about `scope=congress` (19,171 bills, ~$20; needs the key cap raised).

### Later

- Vote-outcome consistency check (body says "passed" when the last vote failed).
- Feedback into AI Gateway via `generator.gateway_log_id`.
- dfdl-ui domain: buy it on Cloudflare at the very end (Dylan's list).
