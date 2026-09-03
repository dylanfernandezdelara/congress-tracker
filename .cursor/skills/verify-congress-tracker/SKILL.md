---
name: verify-congress-tracker
description: Drive the Congress Tracker web UI (Track Congress feed at 127.0.0.1:5174 by default) the way a user does — launch an isolated Vite + Worker stack, exercise feed/search/filters/member sheets, and capture screenshots plus ARIA snapshots. Use when proving UI behavior, reproducing a feed bug, or verifying a change against the seeded local app.
---

# Verify Congress Tracker

Primary surface: the **Track Congress** web UI (`web/`, Vite + React) at the helper's web URL (default `http://127.0.0.1:5174`). Users read a chronological passage-vote feed, filter it, expand a bill, and open member profiles.

Secondary surfaces (do not substitute for UI proof unless the mapped feature says so):

- Worker JSON API on the helper's worker URL (default `http://127.0.0.1:8788`; Vite proxies `/feed`, `/stats`, `/health`, `/debug/*.json` to it).
- Ops page `/debug` (ingest monitor).
- `npm run qa:web` — viewport clip checks that **mock** feed JSON. That is not this skill. Drive the real seeded stack.

Read `features/README.md` before driving. Prove the mapped entry points, not a convenient shortcut.

## Launch

Verification uses its own ports (default Vite **5174**, worker **8788**, CDP **9223**) and its own D1, so it can run beside `npm run dev:*`. The user's 5173/8787 stack is never touched. If a **verification** port is already listening, **refuse** — do not kill by process name, and do not attach to a server this run did not start. Override with `VERIFY_WEB_PORT` / `VERIFY_WORKER_PORT` / `VERIFY_CDP_PORT`.

Verification D1 is a disposable `--persist-to` store at `artifacts/verify/.run/d1` (absolute path; spawn cwd is the repo root). Launch **never** reads or writes `workers/senate_data_worker/.wrangler/state` (the human `npm run seed` / `dev:worker` store). Seed data is synthetic `(local sample)` / `LOCAL:*` — **not** a production dump. Never run `npm run sync:preview-db`, pipeline POSTs, or `d1 execute --remote` for this skill.

From the repo root:

```bash
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker launch
```

Launch will:

1. Fail if verification ports `:5174` or `:8788` (or `:9223`) are already listening.
2. Run `npm run seed` with `SEED_PERSIST_TO` pointed at `artifacts/verify/.run/d1` (writes `(local sample)` bills, members, laws, and confirmations into that isolated store only).
3. Start the Worker with `wrangler dev --local --persist-to artifacts/verify/.run/d1 --port 8788` (resolved to an absolute path). Then start `npm run dev:web -- --mode verify-congress-tracker` with `VITE_DEV_PORT=5174` and `VITE_WORKER_ORIGIN=http://127.0.0.1:8788`; the mode is only an ownership marker for cleanup and does not change app behavior.
4. Wait until `GET http://127.0.0.1:8788/health` and `GET http://127.0.0.1:5174` return HTTP 200.

Ready when stdout includes `ready. Run doctor` and doctor (below) exits 0. Worker `/health` may be `degraded` locally because ingest cron does not run — that is still driveable. Feed JSON must be sample-only (`(local sample)` on every item). `--local` means Senate.gov Browser Rendering is unavailable; do not use this instance to prove live ingest.

Teardown is `cleanup` (below), not `pkill wrangler` / `pkill vite`.

Seeded fixtures this skill assumes (API JSON still contains `(local sample)`; `trimDisplayTitle` strips that suffix from **bill** headlines in the UI):

- Visible bill topics: `House passes a broad energy permitting and production package`, `Senate passes a public lands conservation and access bill`, `House passes a federal spending oversight bill`.
- Members: `Rep. Sample Crossover (local)`, `Rep. Sample Loyal (local)`, `Sen. Sample Crossover (local)`, `Sen. Sample Loyal (local)`.
- Confirmation heading (keeps the seed suffix): `Jane Doe confirmed as Energy Secretary (local sample)`.

## Doctor

Run first whenever anything looks off:

```bash
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker doctor
```

Pass means: this run's worker and web PIDs are alive, both ports listen, Vite's `/health` proxy works, and `/feed/latest.json` is **sample-only** — every item has `(local sample)` in headline or title, including the three required fixtures. Any live/non-sample row is a **fail**. Empty feed is a fail. `browser` and `api` reuse the ownership check. Fail means stop and launch (or cleanup a stale verification run) — do not drive an unknown process on those ports.

## Drive

Harness: Playwright Chromium via the helper, **1280×800** so desktop rails mount (`min-width: 1024px`). Prefer roles and accessible names. Stable handles from this repo:

| Control | Handle |
| --- | --- |
| Page identity | heading `Track Congress` |
| Timeline | heading `Chronological timeline`; rows `#feed-top .feed-row` / `[data-feed-row-key]` |
| Bill topic | heading `House passes a broad energy permitting and production package` (also under New laws — use `--nth 0` for the timeline) |
| Expand row | button whose name includes that topic (`aria-expanded`) |
| Expanded detail | region `Details for <topic>` with heading `What it does` |
| Search | searchbox `Search bills`; button `Clear search` |
| Chamber | radiogroup `Filter by chamber`; radios `All`, `House`, `Senate` |
| Advanced filters | button `Filters` (desktop inline panel ≥640px; sheet `Filters` below) |
| Sponsor state | combobox/select `Filter by sponsor state` |
| Theme | button `Switch to dark theme` / `Switch to light theme` |
| Members rail | region `Members in Congress`; button `Open profile for <name>` |
| Vote tightness | region `Vote tightness` (closest-vote margin bars; desktop right rail, mobile under the timeline) |
| Senate-waiting | region `House-passed, sitting in the Senate` |
| Confirmations / laws | regions `Recent confirmations`, `New laws` |

Drive using the exact commands in each feature's **Driving it** section. See `features/feed-timeline.md` for the timeline recipe. Do not invent shorthand.

Inspect the page the way Chrome DevTools would (CDP on `http://127.0.0.1:9223`; Chromium is headless unless `VERIFY_HEADED=1`):

```bash
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser url
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser find --role button --name "House"
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser scroll --role heading --name "Chronological timeline"
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser eval --js "document.title"
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser cdp --method Runtime.evaluate --params '{"expression":"1+1","returnByValue":true}'
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser console
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser network
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria
```

`--name /regex/` is a JavaScript regex. `--exact` requires a full accessible-name match.

Do **not** intercept `/feed` or `/stats` (that is `qa:web`). Do **not** POST `/__pipeline/*` as a stand-in for a UI action. Side-effect reads of the same data the UI shows are allowed:

```bash
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker api GET '/feed/latest.json?limit=50&offset=0'
```

`api` is GET-only and limited to `/feed`, `/stats`, `/health`, and `/debug/*.json`.

Start Chromium once per run with `browser start`, `browser console`, `browser network`, or any other first `browser` command (CDP on `http://127.0.0.1:9223`, profile under `artifacts/verify/.run/`). A detached tap records console + network JSONL. Use `browser cdp` / `browser eval` / `browser console` / `browser network` to inspect. If 9223 is taken, refuse.

## Evidence

Write proof under `artifacts/verify/<feature-id>/` (gitignored). The helper rejects paths that escape that directory. Keep proof after cleanup.

Standards:

- Drive the real UI against the seeded Worker. No API mocks, no test-only flags, no editing D1 mid-proof.
- Capture **before and after** for mutations (filter, search, expand, theme). A final screenshot alone is not proof.
- Pair an ARIA snapshot with a screenshot that shows `Track Congress` and the changed control/result.
- For search/filter, also read `/feed/latest.json?...` (or the page URL query) and confirm the visible rows match.
- Record the feature file and entry point used.

`npm run qa:web` output in `artifacts/qa-viewports/` is viewport QA, not a substitute for these proofs.

## Cleanup

```bash
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker cleanup
```

Sends SIGTERM (then SIGKILL) to the **worker, web, browser, and tap PIDs this launch recorded**. Deletes `artifacts/verify/.run/` only after those PIDs are gone and the recorded verification ports are free (default 5174/8788/9223, or `VERIFY_WEB_PORT` / `VERIFY_WORKER_PORT` / `VERIFY_CDP_PORT` if launch used overrides); otherwise it keeps state and exits non-zero. Feature evidence directories stay. Never `pkill -f wrangler` / `vite` / `chrome`. `.run/` includes the isolated D1, Chrome profile, and console/network JSONL. If `state.json` is corrupt, cleanup recovers ports from the file (falling back to env/defaults per missing field) and only claims processes whose command line names this run.

## Helpers

All commands above are `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker <subcommand>`. Implementation: `bin/verify-congress-tracker.mjs` (browser/CDP in `lib/browser.mjs`; console/network tap in `lib/devtools-tap.mjs`). Run with no args for usage.

If launch fails because verification ports are busy, stop. If seed or health fails, read `artifacts/verify/.run/seed.log`, `worker.log`, and `web.log` before retrying — run cleanup after every failed launch so ports are not left occupied.
