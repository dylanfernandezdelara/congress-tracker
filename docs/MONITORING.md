# Ingest monitoring

Daily feed ingest runs via the Cloudflare Worker cron (`0 10 * * *` UTC). Each run records
success or failure in D1 so you can tell whether the **scheduled** pipeline completed recently.

## Status endpoints

| Endpoint | Use |
|----------|-----|
| `GET /health` | Liveness + `data.ingest` summary (cache-friendly) |
| `GET /debug/ingest.json` | Full ingest monitor payload + alerting hints |
| `/debug` (web) | Human-readable ops page (not linked in nav) |

### Status values

| Status | Meaning |
|--------|---------|
| `ok` | Last **scheduled** run succeeded within the stale window (26h) |
| `stale` | Last scheduled success is older than 26h |
| `failed` | A failure is recorded newer than the last scheduled success |
| `unknown` | No scheduled success recorded yet (admin-only runs do not count) |

Admin-triggered runs (`POST /__pipeline/run/feed`) update `last_success` but do not satisfy
scheduled freshness on their own.

## Alerting options

1. **Cloudflare Workers Observability** — filter logs for `feed_pipeline_failed` or cron
   `0 10 * * *`. Failed runs also log structured JSON from the scheduled handler.

2. **External uptime monitor** — poll `/health` or `/debug/ingest.json` and alert when
   `data.ingest.status` (or `ingest.status`) is not `ok`, or when top-level `/health`
   `status` is `degraded` (ingest stale or failed).

3. **Manual override** — `POST /__pipeline/run/feed` with
   `Authorization: Bearer <PIPELINE_ADMIN_TOKEN>`.

## D1 storage

The `pipeline_state` table stores JSON blobs:

- `feed_pipeline_last_success` — last run result (includes `trigger`: `scheduled` | `admin`)
- `feed_pipeline_last_failure` — last error message and timestamp

Schema is created lazily via `ensureSchema` on first pipeline run after deploy.

## Local development

After `npm run seed` or a local pipeline run, status may still be `unknown` until a run with
`trigger: "scheduled"` is recorded. Cron does not fire in `wrangler dev` by default; use
`POST /__pipeline/run/feed` for manual runs.
