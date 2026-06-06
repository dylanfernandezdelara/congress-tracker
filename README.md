# Congress Tracker

`congress-tracker` is a Cloudflare-native Senate vote intelligence app. The repository is in a **deliberate product reset**: platform wiring (Cloudflare Worker, D1 binding, Vite + React shell) remains, while congressional data models, storage schema, ingestion, and product UI are being redesigned from scratch.

## Developer quick start

In separate terminals:

```bash
npm run dev:worker
npm run dev:web
```

Then open `http://127.0.0.1:5173`. The placeholder homepage checks worker connectivity via `GET /health`.

One-time setup:

```bash
./scripts/cursor-cloud-setup.sh
```

Or manually:

```bash
cp workers/senate_data_worker/.dev.vars.example workers/senate_data_worker/.dev.vars
npm --prefix workers/senate_data_worker install
npm --prefix web install
```

## Architecture (current reset state)

```text
Cloudflare Worker (minimal shell)
  GET /health                         -> 200
  GET /health/data                    -> 503 not_implemented
  GET /briefings/latest.json          -> 503 not_implemented
  GET /votes/:c/:s/:n.json            -> 503 not_implemented
        |
        v
Web app (placeholder shell)
  single page + /health connectivity check
```

D1 (`SENATE_DB`) is bound in Wrangler for future schema work. There are no migrations or tables yet.

## Repository layout

```text
congress-tracker/
├── web/
│   └── src/           # placeholder React shell
├── workers/
│   └── senate_data_worker/
│       ├── src/       # minimal worker HTTP shell
│       └── wrangler.toml
└── scripts/
```

## Testing

```bash
npm test
```

## Deployment

```bash
cd workers/senate_data_worker
npm run deploy
```

Set `ALLOWED_ORIGIN` to your deployed frontend origin in production (do not use `*` publicly).

## HTTP API (current)

- `GET /health` — worker liveness and config metadata
- `GET /health/data` — not implemented (503)
- `GET /briefings/latest.json` — not implemented (503)
- `GET /votes/:congress/:session/:voteNumber.json` — not implemented (503)
