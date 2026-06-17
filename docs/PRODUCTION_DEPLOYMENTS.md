# Production deployments (Workers Builds)

Goal: deploy `congress-tracker-api` to production automatically whenever `main`
is updated — **without GitHub Actions**.

Cloudflare [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
is the native git integration for Workers. It watches your GitHub repository,
runs a build on each push, and deploys `main` with `wrangler deploy`. Non-`main`
branches can upload preview versions instead.

## Current status

| Item | Value |
| --- | --- |
| Worker name | `congress-tracker-api` |
| Worker tag (`external_script_id`) | `0398358f0f8a4130b5e60eaff2846902` |
| GitHub repo | `dylanfernandezdelara/congress-tracker` |
| Production branch | `main` |
| Workers Builds | **Not connected yet** (0 builds in account history) |

Verify with Cloudflare MCP (`workers_builds_list_builds`) or the dashboard:
**Workers & Pages → congress-tracker-api → Deployments → View build history**.

## Why not GitHub Actions?

This repo already runs tests in GitHub Actions (`.github/workflows/ci.yml`). That
workflow does **not** deploy. Workers Builds keeps deploy credentials inside
Cloudflare (build tokens), posts preview URLs on PRs, and avoids maintaining a
separate deploy workflow or long-lived `CLOUDFLARE_API_TOKEN` in GitHub Secrets.

## One-time setup

### Step 1 — Install the Cloudflare GitHub App (dashboard, required once)

The Builds API cannot authorize GitHub on your behalf. You must connect GitHub
once in the dashboard:

1. Open [Workers & Pages → congress-tracker-api → Settings → Builds](https://dash.cloudflare.com/?to=/:account/workers-and-pages/view/congress-tracker-api/production/settings/builds).
2. Select **Connect** → **GitHub**.
3. Authorize the **Cloudflare Workers and Pages** app for `dylanfernandezdelara/congress-tracker`.
4. You can stop after OAuth if you prefer the scripted setup in Step 2.

### Step 2 — Configure triggers (dashboard or script)

#### Option A — Dashboard (simplest)

On the same **Settings → Builds** page:

| Setting | Value |
| --- | --- |
| Git repository | `dylanfernandezdelara/congress-tracker` |
| Production branch | `main` |
| Root directory | `/` (repo root) |
| Build command | `npm ci && npm --prefix workers/senate_data_worker ci && npm --prefix web ci && npm run build:web` |
| Deploy command | `npx wrangler deploy --config workers/senate_data_worker/wrangler.toml` |
| Non-production deploy command | `npx wrangler versions upload --config workers/senate_data_worker/wrangler.toml` |

Enable [non-production branch builds](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/#configure-non-production-branch-builds)
if you want PR preview URLs from Cloudflare (in addition to agent-driven
`npm run preview`).

Save, then push a commit to `main` or select **Retry build** to confirm.

#### Option B — Setup script (Builds API)

Create a **user-scoped** API token at
[dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
with:

- **Workers Builds Configuration** — Edit
- **Workers Scripts** — Read

Account-scoped tokens (including the Cursor Cloud `CLOUDFLARE_API_TOKEN`) cannot
call the Builds API.

```bash
export CLOUDFLARE_ACCOUNT_ID="<your-account-id>"
export CLOUDFLARE_BUILDS_API_TOKEN="<user-scoped-token>"
./scripts/setup-workers-builds.sh
```

Add `--preview` to also create a non-`main` preview trigger. Add `--dry-run`
to print the API payloads without sending them.

### Step 3 — Confirm the first deploy

After setup:

1. **Dashboard:** Workers & Pages → congress-tracker-api → Deployments.
2. **GitHub:** a Cloudflare check run appears on the commit.
3. **Smoke test:** `curl -fsS https://<your-worker>.workers.dev/health`

## What runs on each push to `main`

```text
git push origin main
  → Workers Builds (Cloudflare)
      1. npm ci (root, worker, web)
      2. npm run build:web          → web/dist
      3. wrangler deploy            → production Worker + static assets
```

Runtime secrets (`CONGRESS_API_KEY`, `OPENROUTER_API_KEY`, `PIPELINE_ADMIN_TOKEN`)
are **not** build variables. They stay on the Worker via `wrangler secret put`
and are reused by every deployment.

## Monorepo notes

- **Worker name must match** `name` in `workers/senate_data_worker/wrangler.toml`
  (`congress-tracker-api`). A mismatch fails the build.
- **Root directory** must be the repo root so `web/dist` resolves correctly from
  `wrangler.toml` (`directory = "../../web/dist"`).
- Workers Builds **does not** use the optional `[build]` block in `wrangler.toml`;
  set build/deploy commands in the trigger (dashboard or API).
- **Do not** put API keys in build environment variables unless a build step needs
  them. Runtime secrets belong on the Worker.

## Preview vs production

| Mechanism | Command | Affects production? |
| --- | --- | --- |
| Workers Builds on `main` | `wrangler deploy` | Yes |
| Workers Builds on other branches | `wrangler versions upload` | No (preview URL) |
| Cursor Cloud agent | `npm run preview` | No |

See [`docs/PREVIEW_DEPLOYMENTS.md`](PREVIEW_DEPLOYMENTS.md) for preview safety notes.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Builds API returns `Invalid token` | Use a **user-scoped** token with Workers Builds Configuration (Edit). |
| Build fails: worker name mismatch | Ensure dashboard Worker name equals `congress-tracker-api`. |
| Build fails: `web/dist` missing | Confirm build command includes `npm run build:web`. |
| Build succeeds but site is stale | Check deploy command uses `wrangler deploy`, not `versions upload`. |
| No GitHub check runs | Reinstall Cloudflare GitHub App; confirm repo access includes this repo. |
| Cron not firing on preview | Expected — crons run only on the active production deployment. |

## References

- [Workers Builds overview](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
- [Builds API reference](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)
