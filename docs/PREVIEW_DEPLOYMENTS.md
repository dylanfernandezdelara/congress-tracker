# Preview deployments

Goal: from a Cursor Cloud environment, push a commit / open a PR, then open a
live Cloudflare **preview URL** in a normal browser — without ever touching
production traffic.

## How it works

The React app (`web/`) is bundled into the existing Worker
(`congress-tracker-api`) using [Workers static assets](https://developers.cloudflare.com/workers/static-assets/):

- Static files (`/`, `/assets/*`) are served directly from `web/dist`.
- API paths (`/health`, `/feed/*`, `/__pipeline/*`) fall through to the Worker.
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
deployed version. Production only changes via `wrangler versions deploy`
(or the `deploy` npm script).

Each upload yields two URLs:

- **Commit preview URL**: `https://<version-id>-congress-tracker-api.<subdomain>.workers.dev` (unique per upload).
- **Branch alias URL**: `https://<branch>-congress-tracker-api.<subdomain>.workers.dev` (stable across commits on the same branch, when uploaded with `--preview-alias`).

## Option A — GitHub Actions on every PR (implemented)

`.github/workflows/preview.yml` runs on each pull request: it builds the web app,
uploads a preview version aliased to the branch, and comments both preview URLs
on the PR.

One-time setup (you must do this in GitHub + Cloudflare; an agent cannot set
repository secrets):

1. Create a scoped Cloudflare API token at
   <https://dash.cloudflare.com/profile/api-tokens> using the
   **"Edit Cloudflare Workers"** template (scope it to this account/zone).
2. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
   - `CLOUDFLARE_API_TOKEN` — the token from step 1.
   - `CLOUDFLARE_ACCOUNT_ID` — your account ID (`wrangler whoami` shows it).

Then the flow from Cursor Cloud is simply:

1. Commit to a branch and open a PR.
2. Wait for the **Preview Deploy** check; the bot comments the preview URL.
3. Open the URL in your browser.

Forked-PR builds are intentionally skipped (forks can't read secrets, and running
untrusted code with credentials is unsafe).

## Option B — Cloudflare Workers Builds (recommended, no GitHub secret)

Cloudflare's native git integration removes the need to store a long-lived token
in GitHub. One-time setup in the Cloudflare dashboard:

1. **Workers & Pages → congress-tracker-api → Settings → Build** → connect the
   GitHub repository.
2. Set the **production branch** to `main` and build command to:
   `npm ci && npm --prefix web ci && npm run build:web`
   (deploy command stays `npx wrangler deploy`).
3. Enable
   [non-production branch builds](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/#configure-non-production-branch-builds).

Cloudflare then builds each push, deploys `main` to production, and posts
preview URLs as PR comments automatically — the same UX as Cloudflare Pages.

If you adopt Option B, you can delete `.github/workflows/preview.yml` to avoid
duplicate uploads.

## Manual one-off preview (from any shell, including a Cursor Cloud agent)

```bash
npm run build:web
cd workers/senate_data_worker
npx wrangler versions upload --preview-alias my-branch
```

Requires `CLOUDFLARE_API_TOKEN` (and `CLOUDFLARE_ACCOUNT_ID`) in the environment.

## Safety notes

- **Production is never affected by a preview.** `versions upload` does not shift
  traffic; only `versions deploy` / `wrangler deploy` do.
- **Preview versions reuse production bindings and secrets**, including the D1
  database. Treat the preview as having production data access.
- The admin ingestion route `/__pipeline/run/feed` writes to D1. It is reachable
  on preview URLs too. Set a `PIPELINE_ADMIN_TOKEN` secret
  (`wrangler secret put PIPELINE_ADMIN_TOKEN`) so this endpoint requires a token
  and cannot be triggered by anyone who discovers a preview URL.
- Preview URLs are public on `workers.dev`. To restrict them, use
  [Cloudflare Access on preview URLs](https://developers.cloudflare.com/workers/configuration/previews/#manage-access-to-preview-urls).
- Cron triggers only fire on the deployed production version, not on preview
  versions.

## Local development is unchanged

`npm run dev:worker` + `npm run dev:web` still run on `:8787` / `:5173`. In dev
builds the frontend defaults to `http://localhost:8787` (override with
`VITE_API_URL`).
