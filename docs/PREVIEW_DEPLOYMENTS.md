# Preview deployments

Goal: from a Cursor Cloud environment, push a commit / open a PR, then open a
live Cloudflare **preview URL** in a normal browser — without ever touching
production traffic.

## How it works

The React app (`web/`) is bundled into the existing Worker
(`congress-tracker-api`) using [Workers static assets](https://developers.cloudflare.com/workers/static-assets/):

- Static files (`/`, `/assets/*`) are served directly from `web/dist`.
- API paths (`/health`, `/feed/*`, `/stats/*`, `/__pipeline/*`) fall through to the Worker.
- Unknown navigations return the SPA shell (`index.html`) via
  `not_found_handling = "single-page-application"`.

Because the app and API are served from the **same origin**, the frontend calls
the API with relative URLs in production builds (`getApiBaseUrl()` returns `""`
when `import.meta.env.PROD` and no `VITE_API_URL` override is set). This is what
makes previews work: every preview URL serves a fully functional app with no
hardcoded API hostname.

Previews use Cloudflare [version preview URLs](https://developers.cloudflare.com/workers/configuration/previews/)
(`preview_urls = true` in `wrangler.toml`). `wrangler versions upload` creates a
new immutable version with its own URL but leaves production on the currently
deployed version.

**Production** updates when `main` is pushed (Cloudflare Workers Builds runs
`wrangler deploy`) or when you run `npm run deploy` manually. Preview uploads
never shift production traffic.

Each upload yields two URLs:

- **Commit preview URL**: `https://<version-id>-congress-tracker-api.<subdomain>.workers.dev` (unique per upload).
- **Branch alias URL**: `https://<branch>-congress-tracker-api.<subdomain>.workers.dev` (stable across commits on the same branch, when uploaded with `--preview-alias`).

## Primary — ask the Cursor Cloud agent (no PR, no secrets)

A Cursor Cloud agent runs in an environment that already has `wrangler` and the
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` it needs. So the simplest flow
is to just ask the agent for a preview after it makes changes:

```bash
npm run preview
```

This builds `web/dist` and runs `wrangler versions upload`, which prints a
**Version Preview URL** the agent can paste back into the chat. Add a stable
per-branch alias with:

```bash
npm run build:web
cd workers/senate_data_worker
npx wrangler versions upload --env preview --preview-alias my-branch
# -> https://my-branch-congress-tracker-api.<subdomain>.workers.dev
```

You can also run `npm run preview` yourself from any shell that has the two
Cloudflare env vars set. No GitHub Actions, secrets, or pull request required.

## Production deploys — Cloudflare Workers Builds (no GitHub Actions)

This repo uses [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
(not GitHub Actions) for CI/CD:

| Branch | Deploy command | Result |
| --- | --- | --- |
| `main` (production) | `npm --prefix workers/senate_data_worker run deploy` | Live at `https://congress-tracker-api.<subdomain>.workers.dev` |
| Other branches (preview) | `npm --prefix workers/senate_data_worker run preview:upload` | Preview URLs only; production unchanged |

Shared build command:

```bash
npm ci && npm --prefix workers/senate_data_worker ci && npm --prefix web ci && npm run build:web
```

Set the Workers Builds **root directory** to the repo root (where `package.json`
and the mirrored root `wrangler.toml` live). Use the **npm deploy commands**
in the table above — they run Wrangler from `workers/senate_data_worker` with
its pinned version and `wrangler.toml` (kept in sync with the root config via
`wrangler-config-contract.test.mjs`). Do not substitute bare `npx wrangler …`
at repo root in the dashboard.

### One-time setup / fix deploy commands

Run from a shell with a **user-scoped** API token that has **Workers Builds
Configuration: Edit** (account deploy tokens cannot call the Builds API):

```bash
CLOUDFLARE_BUILDS_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npm run configure:cloudflare-builds
```

Or set the same commands manually in **Workers & Pages → congress-tracker-api →
Settings → Build**:

- **Deploy command** (production branch `main`):
  `npm --prefix workers/senate_data_worker run deploy`
- **Non-production branch deploy command**:
  `npm --prefix workers/senate_data_worker run preview:upload`

Enable [non-production branch builds](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/#configure-non-production-branch-builds)
so PR branches get preview URLs.

After setup, every push to `main` deploys production automatically via Wrangler.
No GitHub Actions deploy workflow is required.

## Safety notes

- **Production is never affected by a preview.** `versions upload` does not shift
  traffic; only `versions deploy` / `wrangler deploy` do.
- **Preview versions use a separate D1 database** via the `[env.preview]` Wrangler
  environment (`congress-tracker-preview`; uploaded with `--env preview`). Production
  is never mutated by preview URLs. Cron and pipeline writes do not run on preview,
  so that D1 can lag (or stay empty). When a preview URL needs current votes, run
  `npm run sync:preview-db` (read production, write preview only). Remote export
  briefly makes production D1 unavailable — do not clone on every preview upload;
  retry a failed import with `SYNC_PREVIEW_DB_DUMP=/tmp/congress-tracker-preview-clone.sql`
  to skip a new export.
  `npm run seed` fills **local** Miniflare D1 only; it does not update remote
  preview URLs.
- **Pipeline writes are disabled on preview hostnames** (`/__pipeline/run/*`
  returns `401 preview_pipeline_writes_disabled`), even when a bearer token is
  supplied. Use production or local dev (`DEV_OPEN_PIPELINE=1`) for admin writes.
- `/__pipeline/run/disclosures` is local-dev only (`ENABLE_SAMPLE_DISCLOSURES=1`
  and `ALLOWED_ORIGIN=*` in `.dev.vars`). Do not enable on production or preview
  Workers.
- Preview URLs are public on `workers.dev`. To restrict them, use
  [Cloudflare Access on preview URLs](https://developers.cloudflare.com/workers/configuration/previews/#manage-access-to-preview-urls).
- Cron triggers only fire on the deployed production version, not on preview
  versions.

## Local development is unchanged

`npm run dev:worker` + `npm run dev:web` still run on `:8787` / `:5173`. In dev
builds the frontend defaults to `http://localhost:8787` (override with
`VITE_API_URL`).
