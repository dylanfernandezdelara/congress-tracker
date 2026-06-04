# Docs agent guide

## Deterministic replay preview (preferred)

Hermetic UI review uses the real worker and Vite app with explicit replay vars. The flow does **not** read `workers/senate_data_worker/.dev.vars` for `DATA_SOURCE`.

```bash
npm run preview:replay
```

This starts the worker with `DATA_SOURCE=replay`, `REPLAY_FIXTURE_SET=canonical`, and a fixed `CLOCK`; triggers ingestion; asserts canonical API data; starts Vite against that worker; prints local URLs and expected routes; and keeps running until interrupted.

Harness artifacts for the run live under `target/preview/` (`wrangler-state/`, `logs/`, `assertions/`). They are gitignored.

Capture screenshots with **Cursor Cloud browser/screenshot artifacts**. Do not commit PNGs under `docs/` or elsewhere in the repo.

Suggested routes (also printed by the script):

- Homepage with harness clock: `http://127.0.0.1:5173/?harness_now=...`
- Lead vote detail: `http://127.0.0.1:5173/votes/119/2/14`

## Opt out of replay

Local manual dev with live Congress.gov / GovInfo ingestion requires real API keys and explicit live mode:

```bash
# In workers/senate_data_worker/.dev.vars (or wrangler secrets on deploy)
DATA_SOURCE=live
```

Do not rely on omitting `DATA_SOURCE`; set `DATA_SOURCE=live` when you intend live pulls. Replay preview and `npm test` flows always pass replay vars via `wrangler dev --var` and ignore `.dev.vars` for `DATA_SOURCE`.

## Other commands

- Full verification: `npm test` (includes contract checks for preview scripts, not browser capture).
- Ad-hoc Playwright capture while you already run dev servers: `npm run snapshot` (requires a running stack; set `URL` if not using `http://127.0.0.1:5173`). Set `OUT` to a gitignored path such as `target/manual-screenshot.png`; never commit screenshots.
