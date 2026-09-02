---
name: verify-congress-tracker
description: Drive the Congress Tracker web UI (Track Congress feed at 127.0.0.1:5173) the way a user does — launch the local Vite + Worker stack, exercise feed/search/filters/member sheets, and capture screenshots plus ARIA snapshots. Use when proving UI behavior, reproducing a feed bug, or verifying a change against the seeded local app.
---

# Verify Congress Tracker

Primary surface: the **Track Congress** web UI (`web/`, Vite + React) at `http://127.0.0.1:5173`. Users read a chronological passage-vote feed, filter it, expand a bill, and open member profiles.

Secondary surfaces (do not substitute for UI proof unless the mapped feature says so):

- Worker JSON API on `http://127.0.0.1:8787` (Vite proxies `/feed`, `/stats`, `/health`, `/debug/*.json` to it).
- Ops page `/debug` (ingest monitor).
- `npm run qa:web` — viewport clip checks that **mock** feed JSON. That is not this skill. Drive the real seeded stack.

Read `features/README.md` before driving. Prove the mapped entry points, not a convenient shortcut.

## Launch

Local D1 is a **single shared SQLite** under `workers/senate_data_worker/.wrangler/state`. Vite is `strictPort` **5173** and proxies to worker **8787**. Two stacks cannot run side by side. If either port is already listening, **refuse** — do not kill the user's session by process name, and do not attach to a server this run did not start.

From the repo root:

```bash
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker launch
```

Launch will:

1. Fail if `:5173` or `:8787` is already listening.
2. Run `npm run seed` (writes `(local sample)` bills, members, laws, and confirmations into **local** D1 only; overwrites prior local sample/real-roster mix).
3. Start the Worker with `wrangler dev --local` (same package as `npm run dev:worker`, plus `--local` so the `BROWSER` remote binding is not required). Then start `npm run dev:web`.
4. Wait until `GET http://127.0.0.1:8787/health` and `GET http://127.0.0.1:5173` return HTTP 200.

Ready when stdout includes `ready. Run doctor` and doctor (below) exits 0. Worker `/health` may be `degraded` locally because ingest cron does not run — that is still driveable. Feed JSON must contain `(local sample)` headlines. `--local` means Senate.gov Browser Rendering is unavailable; do not use this instance to prove live ingest.

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

Pass means: this run's worker and web PIDs are alive, both ports listen, Vite's `/health` proxy works, and `/feed/latest.json` includes the three seeded `(local sample)` headlines. Extra live rows are a warning (seed upserts samples but does not delete existing votes). `browser` and `api` reuse the ownership check. Fail means stop and launch (or cleanup a stale verification run) — do not drive an unknown process on those ports.

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
| Pulse | region `Legislative pulse` |
| Confirmations / laws | regions `Recent confirmations`, `New laws` |

Recipe shape (every feature file uses this CLI):

```bash
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path /
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "Chronological timeline"
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "House"
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser fill --role searchbox --name "Search bills" --value "energy"
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser press --key Enter
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/<feature>/after.aria.txt
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/<feature>/after.png
```

`--name /regex/` is a JavaScript regex. `--exact` requires a full accessible-name match.

Do **not** intercept `/feed` or `/stats` (that is `qa:web`). Do **not** POST `/__pipeline/*` as a stand-in for a UI action. Side-effect reads of the same data the UI shows are allowed:

```bash
./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker api GET '/feed/latest.json?limit=50&offset=0'
```

`api` is GET-only and limited to `/feed`, `/stats`, `/health`, and `/debug/*.json`.

Start Chromium once per run with `browser start` or the first `browser` command (CDP on `127.0.0.1:9223`, profile under `artifacts/verify/.run/`). If 9223 is taken, refuse.

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

Sends SIGTERM (then SIGKILL) to the **worker, web, and browser PIDs this launch recorded**. Deletes `artifacts/verify/.run/` only after those PIDs are gone and ports 5173/8787/9223 are free; otherwise it keeps state and exits non-zero. Feature evidence directories stay. Never `pkill -f wrangler` / `vite` / `chrome`.

## Helpers

All commands above are `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker <subcommand>`. Implementation: `bin/verify-congress-tracker.mjs`. Run with no args for usage.

If launch fails because ports are busy, stop. If seed or health fails, read `artifacts/verify/.run/seed.log`, `worker.log`, and `web.log` before retrying — run cleanup after every failed launch so ports are not left occupied.
