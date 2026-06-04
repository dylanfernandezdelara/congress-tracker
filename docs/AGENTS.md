# Docs agent guide

## Replay screenshots (preferred)

Hermetic mobile screenshots use the real worker and Vite app with explicit replay vars. They do **not** read `workers/senate_data_worker/.dev.vars`.

```bash
npm run screenshot:replay
```

Outputs (gitignored under `target/`; filenames defined in `scripts/harness-env.sh`):

- `target/screenshots/replay-homepage-mobile.png`
- `target/screenshots/replay-vote-detail-mobile.png`

Harness state and assertion artifacts for the run live alongside them under `target/screenshots/` (`wrangler-state/`, `logs/`, `assertions/`).

The flow mirrors `scripts/harness-ci.sh`: `DATA_SOURCE=replay`, `REPLAY_FIXTURE_SET=canonical`, fixed `CLOCK`, ingestion via `curl -fsS` (no `|| true`), `scripts/harness-assert.mjs` (expects lead vote `119:2:14`), then Playwright mobile capture via `web/scripts/snapshot.mjs`.

## Docs-committed screenshots

Refresh tracked images under `docs/screenshots/`:

```bash
npm run docs:snapshots
```

This runs `screenshot:replay`, then copies the two deterministic files above into:

- `docs/screenshots/replay-homepage-mobile.png`
- `docs/screenshots/replay-vote-detail-mobile.png`

## Opt out of replay

Local manual dev with live Congress.gov / GovInfo ingestion requires real API keys and explicit live mode:

```bash
# In workers/senate_data_worker/.dev.vars (or wrangler secrets on deploy)
DATA_SOURCE=live
```

Do not rely on omitting `DATA_SOURCE`; set `DATA_SOURCE=live` when you intend live pulls. Replay screenshot and `npm test` flows always pass replay vars via `wrangler dev --var` and ignore `.dev.vars` for `DATA_SOURCE`.

## Other commands

- Full verification: `npm test` (includes contract checks for screenshot scripts, not the screenshot capture itself).
- Ad-hoc capture while you already run dev servers: `npm run snapshot` (requires `URL` / running stack; not hermetic). Set `FULL_PAGE=1` for a full-page PNG; optional `VIEWPORT_WIDTH` / `VIEWPORT_HEIGHT`, `WAIT_UNTIL`, `SETTLE_MS`, and `ASSERT_TEXT` (replay flow passes the expected fixture title).
