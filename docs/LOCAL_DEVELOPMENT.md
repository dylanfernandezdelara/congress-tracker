# Local development ↔ Cursor Cloud parity

Most of this project has been built on **Cursor Cloud**, where the agent VM
auto-runs `./scripts/cursor-cloud-setup.sh` and ships with Cloudflare
credentials and API keys already injected. This guide makes a **local machine**
behave the same way so you can move between the two without surprises.

## TL;DR

```bash
npm run setup        # install all deps + Playwright + scaffold .dev.vars
npm run seed         # offline: fill local D1 with sample bills/votes (no keys)
npm run verify:local # preflight check that everything is wired up
```

Then, in two terminals:

```bash
npm run dev:worker   # http://127.0.0.1:8787  (API + ingestion)
npm run dev:web      # http://127.0.0.1:5173  (React feed UI)
```

Open `http://127.0.0.1:5173` — the feed shows the seeded sample bills
immediately, no API keys required.

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

This writes a few clearly-labeled `(local sample)` bills, passage votes, and
plain-English digests directly into the **local** D1 store
(`workers/senate_data_worker/.wrangler/state`, via `wrangler d1 execute --local`).
It never touches production/preview D1, needs no network, and is idempotent
(safe to re-run). Vote dates are generated relative to today so they always
fall inside the feed's 45-day lookback window.

### 2. Real ingestion (needs API keys)

Add keys to `workers/senate_data_worker/.dev.vars`:

```bash
CONGRESS_API_KEY=...      # https://api.congress.gov/sign-up/
OPENROUTER_API_KEY=...    # https://openrouter.ai/keys
# Optional override — must be a free OpenRouter model (e.g. nvidia/nemotron-3-ultra-550b-a55b:free).
# When unset, the worker auto-selects the highest Artificial Analysis intelligence_index free model.
# OPENROUTER_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
```

Then, with the worker running:

```bash
curl -fsS -X POST http://127.0.0.1:8787/__pipeline/run/feed
```

This mirrors what the daily cron does in production. Senate votes come from a
public XML endpoint (no key); House votes and CRS summaries need
`CONGRESS_API_KEY`; digest rewrites need `OPENROUTER_API_KEY`.

## Local architecture notes

- **Two origins in dev.** The web app on `:5173` calls the worker API on
  `:8787` cross-origin. The worker allows this because `.dev.vars` sets
  `ALLOWED_ORIGIN=*`. In production/preview the worker serves both the app and
  the API from one origin, so no CORS is involved. Override the API target with
  `VITE_API_URL` if your worker runs on a different port.
- **Cron does not fire locally.** `wrangler dev` does not run the
  `0 10 * * *` schedule; trigger ingestion manually with the curl above, or use
  `npm run seed`.
- **Local D1 is isolated.** It is a separate SQLite store from production. The
  schema is created on demand by `ensureSchema()` (and by `npm run seed`), so
  there is no migration step to run.
- **`npm run preview` is not local.** It builds the web app and uploads a
  Cloudflare preview version, which reuses production bindings (incl. D1). It
  needs Cloudflare credentials and is best run from Cursor Cloud.

## Verifying parity

`npm run verify:local` checks the Node version against `.nvmrc`, confirms
dependencies are installed and `.dev.vars` exists, and — if the worker is
already running — probes `/health` and the feed, nudging you to `npm run seed`
when the feed is empty. It only fails hard on missing Node or dependencies, so
it is safe to run any time.

## Before opening a PR

Follow the ship checklist in [`AGENTS.md`](../AGENTS.md): `npm test`, then for
`web/` changes `npm run qa:web` (with `npm run dev:web` running), a
thermonuclear review of the branch diff, and `npm run preview` for a shareable
URL.
