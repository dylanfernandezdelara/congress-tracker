# Ingest monitoring

Crons (UTC): daily feed `0 10 * * *`, hourly executive `20 * * * *`. Distinct
minutes avoid write-lease collisions.

Scheduled runs persist success/failure in D1. A busy lease records
`last_skipped` (`pipeline_busy`) without changing status fields — alert when
`last_skipped` exists and is not superseded by a later scheduled success
(`last_scheduled_success.completed_at` after `skipped_at`). Sticky non-null
alone is not an alarm.

## Endpoints

| Endpoint | Use |
|----------|-----|
| `GET /health` | Liveness + `data.ingest` |
| `GET /debug/ingest.json` | Full monitor payload |
| `/debug` | Ops UI (not in nav) |
| `POST /__pipeline/senate-vote-menu` | Admin: upload Senate LIS vote-menu XML into D1 cache (`?run_feed=1` to ingest) |

**Ops base URL:** Bot Fight Mode on `trackcongress.org` challenges non-browser
clients. Prefer the workers.dev hostname for automation:

`https://congress-tracker-api.fernandezdelaradylan.workers.dev`

## Status

| Status | Meaning |
|--------|---------|
| `ok` | Last scheduled success within 26h, no chamber source warnings |
| `degraded` | Scheduled success within window with Senate D1 menu **cache fallback** only |
| `stale` | Last scheduled success older than 26h |
| `failed` | Failure newer than last scheduled success, **or** hard chamber soft-skip (`* ingest skipped:`) |
| `unknown` | No scheduled success yet |

Admin runs update `last_success` only; they do not satisfy scheduled freshness.
Top-level `/health` `status` is `degraded` whenever ingest status is not `ok`.

## Senate.gov 403 (known blocker)

Cloudflare Worker egress is frequently blocked by Senate.gov/Akamai (`HTTP 403`
on `vote_menu_*.xml`). The feed cron then serves the D1
`senate_vote_menu_cache_*` blob and records `chamber_warnings`, which now marks
ingest **`degraded`** (previously this stayed `ok` and looked healthy while
Senate data froze).

**Refresh from a non-blocked host** (Cursor Cloud, laptop, automation):

```bash
# Preferred: admin upload + optional immediate feed run
PIPELINE_ADMIN_TOKEN=... RUN_FEED=1 CHECK_HEALTH=1 \
  npm run refresh:senate-menu

# Or write D1 cache only (needs CLOUDFLARE_API_TOKEN); wait for cron or run feed
REFRESH_VIA=d1 npm run refresh:senate-menu
```

## Alerting

Severity split (important while Senate.gov 403 persists):

| Severity | Status | Action |
|----------|--------|--------|
| Page / notify | `failed`, `stale`, `unknown` | True blocker — cron broken, no scheduled success, **or** hard chamber skip (`House/Senate ingest skipped`) |
| Tracked / known | `degraded` (Senate **cache fallback** only) | Keep daily menu refresh; do **not** page forever |
| Clear | `ok` | No action |

`degraded` is reserved for expected Worker→Senate.gov 403 → D1 menu cache fallback.
A soft-fail that skips an entire chamber (`* ingest skipped:`) is **`failed`** so uptime
checks and `CHECK_HEALTH=1` still page.

1. **Workers Observability** — `feed_pipeline_failed` / cron strings; also check
   `last_skipped` (lease skips leave no failure log). Alert only when
   `last_skipped` exists and
   `last_scheduled_success.completed_at` is missing or not after
   `skipped_at` — the field is sticky and non-null alone is not an alarm.
2. **Uptime** — poll workers.dev `/health` or `/debug/ingest.json` and **page**
   when `data.ingest.status` is `failed` | `stale` | `unknown`. Treat sustained
   `degraded` + Senate cache-fallback as a known condition (daily refresh), not
   a pager storm; optional notify only on transition *into* `degraded`.
3. **Manual** — `POST /__pipeline/run/feed` with
   `Authorization: Bearer <PIPELINE_ADMIN_TOKEN>`.
4. **Cursor Automation (recommended)** — schedule a daily cloud agent that:
   - Fetches the live Senate vote menu (this environment can reach senate.gov)
   - Runs `PIPELINE_ADMIN_TOKEN=... RUN_FEED=1 CHECK_HEALTH=1 npm run refresh:senate-menu`
   - Notifies you when the script exits non-zero (true blockers: `failed` /
     `stale` / `unknown`, fetch errors, or admin upload failures). Note:
     ingest stays **`degraded`** while Worker→Senate.gov is 403 even after a
     successful cache refresh — that alone is not an automation failure
     (`CHECK_HEALTH` accepts `ok` | `degraded`). A newer admin feed success
     (e.g. `RUN_FEED=1`) supplies chamber_warnings for severity, so a prior
     scheduled hard-skip `failed` clears after a successful remediation.

   Suggested automation prompt:

   > On repo `congress-tracker`, run production Senate menu refresh + feed:
   > `PIPELINE_ADMIN_TOKEN=$PIPELINE_ADMIN_TOKEN RUN_FEED=1 CHECK_HEALTH=1 npm run refresh:senate-menu`
   > using workers.dev (not trackcongress.org). If exit code ≠ 0, treat as a
   > production ingest blocker and notify me with `/health` JSON and the script
   > logs. `degraded` with Senate cache-fallback warnings is expected until
   > Worker egress can reach senate.gov; still refresh the cache daily. Do not
   > open a PR unless code changes are required to clear a true blocker.
   > Ensure secret `PIPELINE_ADMIN_TOKEN` is available to the automation
   > environment (plus `CLOUDFLARE_*` if using `REFRESH_VIA=d1`).

## Edge cache (feed / stats JSON)

Public JSON uses `Cache-Control: s-maxage=60, stale-while-revalidate=30`.
Successful pipeline runs (admin + cron) also call Cloudflare
`purge_everything` for the production zone when `CF_ZONE_ID` +
`CACHE_PURGE_TOKEN` are set (free plans cannot prefix-purge only `/stats/*`).

After a manual D1 repair (or any write outside the pipeline), purge explicitly:

```bash
curl -fsS -X POST https://congress-tracker-api.fernandezdelaradylan.workers.dev/__pipeline/purge-cache \
  -H "Authorization: Bearer $PIPELINE_ADMIN_TOKEN"
```

`CACHE_PURGE_TOKEN` is a Worker secret (`wrangler secret put CACHE_PURGE_TOKEN`)
with Zone → Cache Purge permission. Preview sets `CF_ZONE_ID=""`.

## D1 keys (`pipeline_state`)

Feed: `feed_pipeline_last_success`, `…_last_scheduled_success`, `…_last_failure`,
`…_last_skipped`.

Executive: `executive_posts_pipeline_last_success`, `…_last_scheduled_success`,
`…_last_failure`.

Senate menu fallback: `senate_vote_menu_cache_{congress}_{session}`.

Both split last-run vs last-scheduled-run so `status` answers "is the cron
healthy?" only. Schema is created via `ensureSchema` on first pipeline run.

## Local

Cron does not fire in `wrangler dev`. Status stays `unknown` until a
`trigger: "scheduled"` run is recorded; use `POST /__pipeline/run/feed`.
