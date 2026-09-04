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

`workers_dev = true` must stay set in both `wrangler.toml` files. Custom-domain
`[[routes]]` make Wrangler infer `workers_dev = false` on deploy unless it is
explicit — that previously broke ops `/health` and admin pipeline POSTs (HTTP
1042 / 404) while the custom domain stayed Bot-Fight locked. If workers.dev is
unreachable, `npm run refresh:senate-menu` falls back to D1 for cache writes and
`CHECK_HEALTH=1`.

## Status

| Status | Meaning |
|--------|---------|
| `ok` | Last scheduled success within 26h, no chamber source warnings, no intro-list soft-fail, menu cache fresh (<48h) |
| `degraded` | Scheduled success within window with Senate D1 menu **cache fallback**, **and/or** menu cache stale (>48h), **and/or** intro discovery soft-fail |
| `stale` | Last scheduled success older than 26h |
| `failed` | Failure newer than last scheduled success, hard chamber soft-skip (`* ingest skipped:`), **or** menu cache nearing expiry (>6d) / expired (>7d) |
| `unknown` | No scheduled success yet |

Admin runs update `last_success` only; they do not satisfy scheduled freshness.
Top-level `/health` `status` is `degraded` whenever ingest status is not `ok`.

`latest_passage_vote_date` / `floor_quiet_days` answer "when did the floor last
vote?", not "is ingest running?" A large `floor_quiet_days` with status `ok`
is August recess (or any quiet stretch): Clerk House rolls and Senate.gov menu
have nothing newer. Do **not** page that as a stuck timeline. `missing_digest_count`
is scoped to bills inside the 45-day feed window; older session-backfill rows
without rewrites are expected.

House ingest that hits the per-run detail cap records `House ingest truncated:…`
and is **`degraded`** (newest-first fetch still lands the current week's rolls).

Intro discovery (Congress.gov `/v3/bill/{congress}/{hr|s}` list, shipped in #168)
always persists `introsDiscovered`, `introsPersisted`, and `intro_warnings` on
the success record — including zeros / empty arrays. Morning ops should read
`data.ingest.status`, `last_success.introsDiscovered` / `introsPersisted`,
`last_success.intro_warnings`, and Observability events
`feed_pipeline_failed` / `feed_pipeline_intro_list_failed`. A run that records
`Intro list failed:…` is **`degraded`**. Pre-#168 `last_success` rows omit the
`intros*` keys and stay `ok` when otherwise fresh — do not treat missing fields
on those legacy records as a failure. A quiet day (`introsDiscovered: 0`, empty
warnings) stays `ok`. Per-bill persist warnings and unprefixed leftover strings
do not flip status.
A warning that a chamber **source listed latest YYYY-MM-DD is newer than stored**
is **`failed`** — listed/menu dates got ahead of D1. Successful runs persist
`house_source_latest_date` / `senate_source_latest_date` on `last_success` for
that same comparison.

## Quiet floor vs ingest lag (source watermarks)

When the chronological timeline looks frozen, compare official sources to D1
**before** treating it as a stuck pipeline. Matching watermarks plus ingest
`status=ok` means the floor is quiet.

| Check | How | 2026-08-25 (worked example) |
|-------|-----|-----------------------------|
| Clerk House | `https://clerk.house.gov/evs/{year}/roll{n}.xml` — newest existing roll | Roll **283** `23-Jul-2026` On Passage H.R. 8884; **284+ 404** |
| Congress.gov House list | `/v3/house-vote/{congress}/{session}` | **283** rolls; latest `2026-07-23` roll 283 H.R. 8884 |
| Senate.gov menu | `vote_menu_{congress}_{session}.xml` | **231** votes; last passage **00228** H.R. 6500 `08-Aug` (231 is cloture on S. 5271 the same day) |
| Production D1 `votes` | `MAX(vote_date)` per chamber, `is_passage = 1` | House **2026-07-23** (77); Senate **2026-08-08** (5) |
| `GET /feed/latest.json` | first item | Senate H.R. 6500 roll 228 **2026-08-08** |
| `GET /health` (`workers.dev`) | `data.ingest` | `ok`, scheduled success `2026-08-25T10:03:12Z`, `votesUpserted: 0` |

Repeat the source rows (Clerk, Congress.gov, Senate.gov) whenever this report
recurs. If any source is newer than D1/`latest_passage_vote_date`, ingest is
behind — page `failed` and run `POST /__pipeline/run/feed`. If sources match D1
and status is `ok`, the timeline is current and Congress is not voting.

## Senate.gov 403 (known blocker)

Plain Worker `fetch` to Senate.gov/Akamai is frequently `HTTP 403` on
`vote_menu_*.xml` (and per-roll member XML). **Cloudflare Browser Rendering**
is the primary, Cloudflare-native workaround: the Worker `BROWSER` binding's
`/content` quick action still reaches senate.gov, extracts LIS XML (including
Chromium's XML-viewer wrapper), writes the D1 menu cache, and continues the
normal feed cron. No GitHub Actions job is required.

If Browser Rendering is unavailable or fails, the feed cron falls back to the
D1 `senate_vote_menu_cache_*` blob and records `chamber_warnings`, which marks
ingest **`degraded`** (cache-fallback) or **`failed`** when the cache is
nearing/past the 7-day expiry.

**Manual break-glass** (Cursor Cloud, laptop) when you need an immediate
refresh outside cron:

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
| Page / notify | `failed`, `stale`, `unknown` | True blocker — cron broken, no scheduled success, hard chamber skip, **or** menu cache nearing expiry / expired |
| Tracked / known | `degraded` (Senate **cache fallback**, menu cache stale >48h, and/or intro list soft-fail) | Confirm `senate_fetch_browser_rendering_fallback` / menu cache write, or `feed_pipeline_intro_list_failed` + `last_success.intro_warnings`, in Workers Logs; page only if Browser Rendering **and** D1 cache both fail, cache nears 7d, or intro list stays failed across runs. Break-glass: `npm run refresh:senate-menu`. Do **not** page forever on expected 403→BR/cache. |
| Clear | `ok` | No action |

`degraded` covers expected Worker→Senate.gov 403 → Browser Rendering (or D1
menu cache fallback) and stale-but-usable cache (>48h). A soft-fail that skips
an entire chamber (`* ingest skipped:`) or a menu cache within 24h of the 7d
hard expiry is **`failed`** so uptime checks and `CHECK_HEALTH=1` still page.

1. **Workers Observability** — `feed_pipeline_failed` /
   `feed_pipeline_intro_list_failed` / cron strings; also check
   `last_skipped` (lease skips leave no failure log). Alert only when
   `last_skipped` exists and
   `last_scheduled_success.completed_at` is missing or not after
   `skipped_at` — the field is sticky and non-null alone is not an alarm.
2. **Uptime** — poll workers.dev `/health` or `/debug/ingest.json` and **page**
   when `data.ingest.status` is `failed` | `stale` | `unknown`. Treat sustained
   `degraded` (403 → Browser Rendering and/or D1 cache) as a known condition,
   not a pager storm; optional notify only on transition *into* `degraded`.
   A large `floor_quiet_days` with status `ok` is a quiet floor, not a page.
3. **Manual** — `POST /__pipeline/run/feed` with
   `Authorization: Bearer <PIPELINE_ADMIN_TOKEN>`.
4. **Browser Rendering (primary, in-Worker)** — daily feed cron uses the
   `BROWSER` binding when plain `fetch` to senate.gov fails. Keep this binding
   in both root and worker `wrangler.toml` (and `[env.preview.browser]` —
   browser bindings are not inherited by named envs). Requires
   `compatibility_date >= 2026-03-24`. Local `wrangler dev` needs
   `browser.remote = true` (or `--remote`) because `quickAction` is not
   supported fully locally.
5. **Manual / Cursor break-glass only** — if Browser Rendering and the D1
   cache both fail, run
   `PIPELINE_ADMIN_TOKEN=... RUN_FEED=1 CHECK_HEALTH=1 npm run refresh:senate-menu`
   from a host that can reach senate.gov. Do **not** rely on GitHub Actions
   for this path.

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

`/health` and `/debug/ingest.json` also expose `senate_vote_menu_cache`
(`fetched_at`, `age_hours`, `stale` >48h, `nearing_expiry` >6d, `expired` >7d).
Nearing expiry / expired pages as **`failed`** so daily refresh cannot silently
miss until the hard-skip cliff.

Both split last-run vs last-scheduled-run so `status` answers "is the cron
healthy?" only. Schema is created via `ensureSchema` on first pipeline run.

## Local

Cron does not fire in `wrangler dev`. Status stays `unknown` until a
`trigger: "scheduled"` run is recorded; use `POST /__pipeline/run/feed`.
