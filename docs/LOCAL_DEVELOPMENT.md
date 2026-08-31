# Local development ↔ Cursor Cloud parity

Most of this project has been built on **Cursor Cloud**, where the agent VM
auto-runs `./scripts/cursor-cloud-setup.sh` and ships with Cloudflare
credentials and API keys already injected. This guide makes a **local machine**
behave the same way so you can move between the two without surprises.

## TL;DR

```bash
npm run setup        # install all deps + Playwright + scaffold .dev.vars
npm run seed         # required: fill local D1 with sample feed + left-rail data
npm run verify:local # preflight check that everything is wired up
```

Local D1 starts empty — **without `npm run seed`**, the feed and House/Senate
left rail have nothing to show. Then, in two terminals:

```bash
npm run dev:worker   # http://127.0.0.1:8787  (API + ingestion)
npm run dev:web      # http://127.0.0.1:5173  (React feed UI)
```

Open `http://127.0.0.1:5173` — the seeded sample bills and member spotlights
appear immediately, no API keys required.

The Vite dev server proxies `/feed`, `/stats`, `/health`, and `/debug`
to the worker on `:8787`, so the UI uses same-origin API URLs (matching
production). **Both dev servers must be running** — if only `dev:web` is up,
chamber/notable/feed requests fail with connection errors.

## What Cursor Cloud does for you (and the local equivalent)

| Concern | Cursor Cloud | Local equivalent |
| --- | --- | --- |
| Dependency install | `.cursor/environment.json` runs `cursor-cloud-setup.sh` on boot | `npm run setup` |
| `.dev.vars` file | Created from the example by setup | `npm run setup` creates it; edit to add real keys |
| Feed data | Live ingestion with injected `CONGRESS_API_KEY` / `OPENROUTER_API_KEY` | `npm run seed` (offline sample) **or** real keys + ingestion curl |
| Cloudflare auth | `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` injected | `npx wrangler login` (or API token env vars) — needed for `npm run preview` and remote D1 MCP queries |
| Node version | Pinned image | `.nvmrc` (Node 20, matches CI) — run `nvm use` |
| Sanity check | Agent ship checklist | `npm run verify:local` |

## Getting feed data locally

The local D1 database starts empty, so a fresh clone would otherwise show
"No passage votes…". There are two ways to populate it:

### 1. Offline sample data (no keys, recommended for UI work)

```bash
npm run seed
```

This writes clearly-labeled `(local sample)` bills, passage votes, plain-English
digests, and **left-rail House/Senate member spotlights** (defectors +
portfolios) into the **local** D1 store
(`workers/senate_data_worker/.wrangler/state`, via `wrangler d1 execute --local`).
It never touches production/preview D1, needs no network, and is idempotent
(safe to re-run). Vote dates are generated relative to today so they always
fall inside the feed's 45-day lookback window.

`npm run seed` also clears any previously synced **real** member roster from
local D1. That matters because a full real roster hides `LOCAL:*` sample
spotlights in `/stats/defectors.json` and `/stats/portfolios.json` — the APIs
the left rail uses. Prefer seed for UI work; use real ingestion only when you
need live Congress data.

### 2. Real ingestion (needs API keys)

Add keys to `workers/senate_data_worker/.dev.vars`:

```bash
CONGRESS_API_KEY=...      # https://api.congress.gov/sign-up/
OPENROUTER_API_KEY=...    # https://openrouter.ai/keys
# Optional override — must be a free OpenRouter model (e.g. nvidia/nemotron-3-ultra-550b-a55b:free).
# When unset, the worker auto-selects the highest Artificial Analysis intelligence_index free model.
# OPENROUTER_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
```

For admin pipeline routes (`POST /__pipeline/run/*`), local dev needs
`DEV_OPEN_PIPELINE=1` in `.dev.vars` (included in the example file). **Restart
`npm run dev:worker` after any `.dev.vars` change** — wrangler hot-reloads code
but not secrets/vars. On startup you should see `env.DEV_OPEN_PIPELINE` in the
bindings list; if it is missing, the worker is still running with old env.
If you set `PIPELINE_ADMIN_TOKEN` instead, omit `DEV_OPEN_PIPELINE` and pass
`Authorization: Bearer <token>` on each POST.

Then, with the worker running:

```bash
curl -fsS -X POST http://127.0.0.1:8787/__pipeline/run/feed
curl -fsS -X POST http://127.0.0.1:8787/__pipeline/run/members-roster
curl -fsS -X POST http://127.0.0.1:8787/__pipeline/run/member-votes
# Full-session left-rail spotlights also need (admin):
# curl -fsS -X POST http://127.0.0.1:8787/__pipeline/run/session-backfill
# then re-run member-votes
```

This mirrors what the daily cron does in production. Senate votes come from a
public XML endpoint (no key); House votes and CRS summaries need
`CONGRESS_API_KEY`; digest rewrites need `OPENROUTER_API_KEY`.

**UI note:** `members-roster` / `member-votes` replace sample members with a real
roster. Until real `member_cross_votes` exist (after session backfill + member
votes), the left House/Senate rail will look empty. Re-run `npm run seed` to
restore offline sample spotlights for UI work.

## Local architecture notes

- **Same-origin API in dev.** Vite proxies `/feed`, `/stats`, `/health`, and
  `/debug` to the worker on `:8787`, matching production/preview
  (one origin serves UI + API). Set `VITE_API_URL` only if you bypass the proxy
  (e.g. worker on a non-default port).
- **Cron does not fire locally.** `wrangler dev` does not run the
  `0 10 * * *` schedule; trigger ingestion manually with the curl above, or use
  `npm run seed`.
- **Local D1 is isolated.** It is a separate SQLite store from production. The
  schema is created on demand by `ensureSchema()` (and by `npm run seed`), so
  there is no migration step to run.
- **`npm run preview` is not local.** It builds the web app and uploads a
  Cloudflare preview Worker. That version uses the `[env.preview]` D1
  (`congress-tracker-preview`), not production. Cron does not run on preview,
  and pipeline writes are blocked, so the preview DB can lag production or stay
  empty. If the preview feed lags production, copy current data with
  `npm run sync:preview-db` (does not write production; remote export briefly
  stalls live D1, so do not run it on every upload). `npm run seed` is local
  Miniflare only. Needs Cloudflare credentials; best run from Cursor Cloud.

## Verifying parity

`npm run verify:local` checks the Node version against `.nvmrc`, confirms
dependencies are installed and `.dev.vars` exists, and — if the worker is
already running — probes `/health` and the feed, nudging you to `npm run seed`
when the feed is empty. It only fails hard on missing Node or dependencies, so
it is safe to run any time.

## Before opening a PR

Follow the ship checklist in [`AGENTS.md`](../AGENTS.md): `npm test`, then for
`web/` changes `npm run qa:web` (with `npm run dev:web` running), a
thermonuclear review of the branch diff with Grok 4.6 (`cursor-grok-4.6-high-fast`; never Grok 4.5),
and `npm run preview` for a shareable URL.
