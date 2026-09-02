# Congress Tracker

Cloudflare-native app: ingest House + Senate **passage** roll-call votes, join CRS summaries, rewrite to plain English via OpenRouter, serve an action-row feed.

## Runtime surfaces

- `workers/senate_data_worker/wrangler.toml` — Cloudflare Worker (ingestion + API)
- `web/` — Vite + React feed UI

## Commands

### Install and setup

```bash
npm run setup # same as ./scripts/cursor-cloud-setup.sh (Cursor Cloud runs this via .cursor/environment.json)
```

Copy `workers/senate_data_worker/.dev.vars.example` to `.dev.vars` and set `CONGRESS_API_KEY`, `OPENROUTER_API_KEY`, and optionally `OPENROUTER_MODEL`.

`npm run setup` also installs root Playwright tooling used by `npm run qa:web`.

Local ↔ Cursor Cloud parity: [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md). Quick check: `npm run verify:local`.

**Local data:** Local D1 starts empty. Run `npm run seed` for offline sample
feed + House/Senate left-rail spotlights (no API keys). Do this before UI work;
re-run after `members-roster` / `member-votes` if those rails go empty.

### Local development

- **Seed sample data (required for local UI):** `npm run seed`
- Worker: `npm run dev:worker` (`http://127.0.0.1:8787`)
- Web: `npm run dev:web` (`http://127.0.0.1:5173`)
- Trigger live ingestion (needs API keys): `curl -fsS -X POST http://127.0.0.1:8787/__pipeline/run/feed`
- Feed JSON: `http://127.0.0.1:8787/feed/latest.json?limit=50&offset=0` (paginated object; read `items`)

### Verification

```bash
npm test
```

#### Driving the real UI (agents)

Use [`.cursor/skills/verify-congress-tracker/SKILL.md`](.cursor/skills/verify-congress-tracker/SKILL.md). Launch / doctor / drive / cleanup via `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker`. The helper uses isolated ports (5174/8788) and isolated sample D1, and exposes Chrome DevTools via `browser cdp|eval|console|network`.

### Cursor Cloud ship checklist (required for `web/` changes)

Viewport QA and thermonuclear review run in **Cursor / Cursor Cloud**, not GitHub Actions. Every agent session should follow this before opening or updating a PR:

1. `npm test`
2. For `web/` changes: `npm run dev:web` (separate terminal) then `npm run qa:web`. For behavior changes in `web/`, also prove the affected feature with the verify skill (`features/<feature>.md`) and keep evidence under `artifacts/verify/`.
3. Run thermonuclear review per `.cursor/rules/pr-thermonuclear-review.mdc` (two Grok 4.6 thermos passes in one background launch, then synthesize); fix CRITICAL and WARNING findings; repeat until CLEAR. Never launch thermos on Grok 4.5 (`cursor-grok-4.5-high-fast`).
4. `npm run preview` — paste the Cloudflare Preview URL into **chat for the user** and the PR (do not wait for the user to ask). If that URL’s feed lags production, run `npm run sync:preview-db` once (it exports production D1 and briefly makes live queries unavailable; do not run it on every preview upload).
5. Include QA results, thermonuclear review outcome, and preview URL in the PR description

Whenever you change the UI (`web/`), always share the preview URL in your reply so the user can click through and review the visual changes. Each `npm run preview` run prints a new version-specific URL; do not reuse an older link unless you confirm it matches the current build.

`qa:web` checks home across iPhone SE (320px), iPhone 14 (390px), desktop (1280px), and wide desktop (1440px) in both light and dark mode (8 checks). It verifies the header, theme, feed card / sidebar sections, and headlines are not clipped, and that the requested theme is active. Override the target URL with `QA_WEB_URL` if Vite uses a non-default port. Screenshots and a JSON summary land in `artifacts/qa-viewports/`.

Agent context lives in this file and `.cursor/rules/` (`pr-viewport-qa.mdc`, `pr-thermonuclear-review.mdc`) so any Cursor session picks up the same workflow without depending on GitHub.

### Production deploys (Cloudflare Workers Builds, not GitHub Actions)

Pushes to `main` should deploy production via Cloudflare Workers Builds
(`wrangler deploy` via the worker package on the production trigger).
PR branches use `wrangler versions upload` for preview URLs only.

One-time or drift fix: `npm run configure:cloudflare-builds` (needs a user API
token with Workers Builds Configuration: Edit). Details:
[`docs/PREVIEW_DEPLOYMENTS.md`](docs/PREVIEW_DEPLOYMENTS.md).

### Preview deployments (browser-openable, no production impact)

The Worker serves the bundled React app (Workers static assets), so one preview
URL shows the whole app. To produce a shareable preview URL:

```bash
npm run preview   # builds web/dist + `wrangler versions upload`; prints a Preview URL
```

- A Cursor Cloud agent runs with `wrangler` + `CLOUDFLARE_API_TOKEN` /
  `CLOUDFLARE_ACCOUNT_ID` already set. Step 4 of the ship checklist runs
  `npm run preview` and pastes the printed URL — do not wait for the user to ask.
- For a stable per-branch URL: `cd workers/senate_data_worker && npx wrangler versions upload --env preview --preview-alias <name>`.
- Previews never receive production traffic (`versions upload` ≠ `deploy`). Deployed
  previews use the `[env.preview]` D1 database (`congress-tracker-preview`); local
  `wrangler dev` uses `preview_database_id`. Pipeline writes are blocked on preview
  hostnames, and cron does not run there, so the preview DB can lag. Copy
  production into it with `npm run sync:preview-db` when the preview feed is
  stale (export production, write preview only; remote export stalls production
  D1 briefly). All preview URLs share that D1. Do not run the clone on every
  `npm run preview`.
- Full details and safety notes: `docs/PREVIEW_DEPLOYMENTS.md`.

## API

- `GET /health` — liveness plus `data.ingest` scheduled-run freshness (`ok` | `degraded` | `stale` | `failed` | `unknown`); top-level `status` is `ok` only when ingest is healthy
- `GET /debug/ingest.json` — detailed ingest monitor payload
- `GET /feed/latest.json?limit=&offset=&chamber=House|Senate&state=NY&sponsor_chamber=House|Senate&sponsor=&sponsor_q=&party=D|R|I&policy=&q=` — paginated feed (`{ items, total, limit, offset, has_more }`; `total` capped at 50). Optional filters AND together: `chamber` = passage-vote chamber; `state` = primary sponsor USPS state (needs `bill_sponsors` from feed ingest); `sponsor_chamber` = House/Senate of the primary sponsor (joins `members`); `sponsor` = primary sponsor bioguide (or `LOCAL:` seed id); `sponsor_q` = sponsor/member name substring; `party` = primary sponsor party; `policy` = exact digest `policy_area`; `q` = case-insensitive substring on title, policy area, digest headline, and normalized bill id. Sponsor facets share one EXISTS so they apply to the same primary sponsor. **Not** a bare array.
- `GET /stats/members.json?q=&chamber=House|Senate&state=NY&limit=` — member autocomplete for sponsor filters (`{ items, q, limit }`; excludes `LIS:` placeholders; keeps `LOCAL:` seed members)
- `GET /stats/policy-areas.json` — distinct digest policy areas for the topic filter (`{ items: string[] }`)
- `GET /stats/session.json` — per-chamber passage vote aggregates
- `GET /stats/pulse.json` — close votes, policy heat, this-week activity, and standing-committee waiting counts (`waiting_in_committee`)
- `GET /stats/recent-laws.json?limit=` — recently enacted bills (default 5, cap 10); each law embeds its full feed `item` (`FeedItem | null`) for expand-in-place detail. Daily feed ingest lists Congress.gov `/v3/law/{congress}/pub` so enactment is not limited to bills still inside the passage-vote lookback.
- `GET /stats/committees.json?chamber=House|Senate` — full standing-committee waiting counts (including zeros); pulse embeds the top waiting rows as `waiting_in_committee`
- `GET /stats/recent-confirmations.json?limit=` — recent Senate nomination confirmations (default 5, cap 10); each item includes nominee, position/org, tally, plain-English background, named cross-party voters (`cross_party_votes`), and a grounded Wikipedia-sourced `vote_context` ("why it was contested") when available. Vote-context uses the shared grounded-summary helpers in `synthesis/grounded-summary.ts` (confirmation adapter: `confirmation-vote-context.ts`); bill adapters can reuse the same prompt/parse/OpenRouter loop with a different source.
- `GET /stats/defectors.json?chamber=House|Senate&limit=5` — party cross-vote rankings (needs `member_votes`)
- `GET /stats/portfolios.json?chamber=House|Senate&limit=5` — disclosure-based portfolio movers
- `POST /__pipeline/run/feed` (cron also runs feed + member-votes daily at 10:00 UTC)
- `POST /__pipeline/senate-vote-menu` — admin upload of Senate LIS vote-menu XML into D1 cache (`?run_feed=1` to chain ingest); break-glass when Browser Rendering + D1 cache both fail. Daily cron uses the Worker `BROWSER` binding to fetch senate.gov after plain `fetch` 403s. Ops script: `npm run refresh:senate-menu`
- `POST /__pipeline/purge-cache` — zone-wide Cloudflare edge cache purge (admin; also runs automatically after successful pipeline writes when `CACHE_PURGE_TOKEN` is set)
- `POST /__pipeline/run/digest-refresh?bill=HR1234&bills=S.2` — force-rewrite digests for specific bills (admin)
- `POST /__pipeline/run/session-backfill` — full-session vote backfill (admin)
- `POST /__pipeline/run/member-votes` — ingest per-member passage votes (admin; also chained after daily feed cron)
- `POST /__pipeline/run/process-backfill` — capped/resumable committee-process discovery + hydration (admin; re-invoke until `bills_remaining` is 0)
- `POST /__pipeline/run/process-refresh` — hydrate pending `process_refresh_queue` bills only (admin; daily feed also force-refreshes a capped slice of feed bills)
- `POST /__pipeline/run/executive-posts` — Truth Social executive ingest (admin; also hourly cron)
- `POST /__pipeline/run/disclosures` — local-dev sample disclosures only (`ENABLE_SAMPLE_DISCLOSURES=1` and `ALLOWED_ORIGIN=*` in `.dev.vars`; never in production)

**Sidebar data backfill (production):** Daily cron already chains feed then `member-votes`. After
deploy, still run `session-backfill` (then re-run `member-votes` if needed) against the
**production** Worker before expecting full-session left-rail member spotlights. Preview
Workers block admin writes and use a separate D1 (`congress-tracker-preview`); that
database is not filled by `npm run seed` (seed is local Miniflare only). If a preview
URL’s feed is stale vs production, run `npm run sync:preview-db` once. Local offline:
`npm run seed` populates sample sidebar data (and clears any local real roster so
`LOCAL:*` spotlights are not hidden). After local `members-roster` / `member-votes`,
re-run `npm run seed` if the House/Senate left rail goes empty during UI work.

**Daily ingest (production):** Cloudflare cron runs `runFeedWithMemberVotes` (feed then
best-effort `member-votes`) at **10:00 UTC**, and `runExecutivePostsPipeline` hourly at **:20**
(`20 * * * *`) — see `[triggers]` in `workers/senate_data_worker/wrangler.toml`
(`crons = ["0 10 * * *", "20 * * * *"]`). The executive cron is off the top of the hour so it
never shares a minute with the daily feed cron (both share one write lease).
`wrangler deploy` applies that schedule; use `npm run deploy:triggers` in
`workers/senate_data_worker` only after `wrangler versions upload` previews. The feed pipeline
only upserts **new** passage votes (skips known roll-call keys) and writes digests for bills
that do not yet have one (capped by `DIGEST_MAX_NEW_REWRITES`). Because Congress.gov lists House
votes oldest-first, daily runs scan list pages until the lookback window is reached (~5 list
requests per run for the current session). Ingest success/failure is persisted in D1
(`pipeline_state`) and surfaced on `GET /health` (`data.ingest`) and `GET /debug/ingest.json`;
web ops UI at `/debug`. See `docs/MONITORING.md`. Manual production ingestion is
`POST /__pipeline/run/feed` on the deployed Worker with
`Authorization: Bearer <PIPELINE_ADMIN_TOKEN>`.

Shared stats/feed JSON types live in `shared/stats-api-types.ts` and `shared/feed-api-types.ts`
(imported by worker + web).

## Project structure

- `workers/senate_data_worker/src/pipeline/run-feed.ts` — ingestion orchestrator
- `workers/senate_data_worker/src/sources/` — House/Senate vote + Congress.gov clients
- `workers/senate_data_worker/src/synthesis/` — OpenRouter digests + grounded summaries (`grounded-summary.ts`, `openrouter-chat.ts`, `llm-json.ts`; confirmation vote-context adapter in `confirmation-vote-context.ts`)
- `workers/senate_data_worker/src/storage/feed.ts` — feed read model
- `wrangler.toml` (repo root) — mirrors `workers/senate_data_worker/wrangler.toml` for Cloudflare Workers Builds
- `web/src/components/FeedRow.tsx` — collapsed feed row UI
- `web/src/components/FeedRowDetail.tsx` — expanded feed row detail panel
- `web/src/utils/feedRowLabels.ts` — topic, event line, procedural detection, teaser helpers
- `.cursor/skills/verify-congress-tracker/` — isolated UI verification helper (ports 5174/8788)

## Key rules

- Prefer commands in this file over guessing root-level npm scripts.
- Default to `npm test` for verification.
- Never commit secrets from `.dev.vars`.
- `FEED_MAX_BILLS` and `DIGEST_MAX_NEW_REWRITES` are module constants in `workers/senate_data_worker/src/constants.ts`. `VOTE_LOOKBACK_DAYS` lives in `shared/feed-constants.ts` (worker re-exports; web imports for empty-state copy).
- Always `git fetch origin` before starting work on a fresh session.
- After `web/` work, follow the ship checklist above (tests → `qa:web` → thermonuclear review → preview URL). Never publish a preview URL without attempting QA and review first.
- After any UI change, always give the user the latest preview URL in chat so they can view the result in a browser.
