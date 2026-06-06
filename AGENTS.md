# Congress Tracker

Cloudflare-native Senate vote intelligence app in **product reset** mode. Platform wiring (Worker + D1 binding + Vite shell) is preserved; data models, ingestion, storage schema, and product UI are being redesigned from scratch.

## Runtime surfaces

- `workers/senate_data_worker/wrangler.toml` — Cloudflare Worker (minimal HTTP shell)
- `web/` — Vite + React placeholder frontend

## Commands

### Install and setup

```bash
./scripts/cursor-cloud-setup.sh
```

Or manually: `npm --prefix workers/senate_data_worker ci`, `npm --prefix web ci`, and copy `workers/senate_data_worker/.dev.vars.example` to `.dev.vars`.

### Local development

- Worker: `npm run dev:worker` (`http://127.0.0.1:8787`)
- Web: `npm run dev:web` (`http://127.0.0.1:5173`)
- Point the web app at a non-default worker: `VITE_API_URL=http://127.0.0.1:8787 npm run dev:web`

### Verification

From repo root:

```bash
npm test
```

Runs worker typecheck/tests, web tests/build, and the cursor-cloud setup contract test.

## Current API behavior

- `GET /health` — returns 200 with worker config metadata
- `GET /health/data`, `GET /briefings/latest.json`, `GET /votes/:c/:s/:n.json` — return 503 `not_implemented` until the redesign lands

## Project structure

- `workers/senate_data_worker/src/worker.ts` — Worker entry (`fetch` + no-op `scheduled`)
- `workers/senate_data_worker/src/http/router.ts` — HTTP router
- `workers/senate_data_worker/src/config.ts` — `Env` bindings (D1 + public vars)
- `web/src/` — placeholder React shell

## Key rules

- Prefer the commands above over guessing root-level npm scripts.
- Default to `npm test` for verification.
- Never commit secrets from `.dev.vars` or local Wrangler state.
- Commit and push directly to `main` when explicitly requested and validation is green; create a feature branch and PR when explicitly requested.
- Local D1 bindings are configured in Wrangler; do not change remote resource IDs just to make local development work.

## Cursor Cloud

Solo-contributor workflow: push fixes directly to `main` (no PRs or `cursor/*` branches) unless the user asks otherwise.

Repo-level agent VMs use `.cursor/environment.json`. On each start, Cursor runs `./scripts/cursor-cloud-setup.sh`. For local debugging, start `npm run dev:worker` and `npm run dev:web` in separate terminals.

- End-to-end check: `npm test`.
- CI uses Node.js 20 (`.github/workflows/ci.yml`).
