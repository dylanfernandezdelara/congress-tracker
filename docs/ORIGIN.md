# Cursor Origin + GitHub + Cloudflare

Congress Tracker is developed on [Cursor Origin](https://cursor.com/docs/origin)
and still deploys production from **GitHub**. GitHub is not deprecated.

Cloudflare [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)
connects only to GitHub or GitLab. Origin is not a supported git provider, so
the production Worker (`congress-tracker-api`) must stay connected to
[`dylanfernandezdelara/congress-tracker`](https://github.com/dylanfernandezdelara/congress-tracker).

## What each host is for

| Surface | Role |
| --- | --- |
| [cursor.com/codebase](https://cursor.com/codebase) (Origin) | Day-to-day development: browse, search, pull requests, cloud agents |
| GitHub (`dylanfernandezdelara/congress-tracker`) | Source of truth for Cloudflare Workers Builds, existing GitHub CI, and security advisories |
| Cloudflare Workers Builds | Production `wrangler deploy` on push to `main`; preview `versions upload` on other branches |

Do **not** replace the GitHub remote, delete the GitHub repository, disable
Workers Builds, or use **Detach from GitHub** in Origin settings. Detach makes
Origin the only source of truth and stops pushes from reaching GitHub, so
production deploys stop.

## Preferred model: Sync from GitHub (keep the mirror)

Origin's [GitHub mirror](https://cursor.com/docs/origin/mirror-github.md) is the
supported way to develop on Origin without moving production off GitHub:

1. Open [cursor.com/codebase](https://cursor.com/codebase).
2. Use **Sync from GitHub** and choose `dylanfernandezdelara/congress-tracker`.
3. Confirm **Settings → General** shows Origin as the mirror and GitHub as the source.

After that:

- Browse, review, and open pull requests on Origin. Mirrored PRs sync back to GitHub.
- Pushes to the Origin remote pass through to GitHub.
- GitHub still triggers Workers Builds (`main` → production, other branches → preview).
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) keeps running on GitHub.
- Origin Apps (Vercel / Depot / Buildkite) do **not** apply to GitHub-mirrored
  repos. Leave CI and deploys on GitHub + Cloudflare.

Clone URL from the green **Code** button:

```text
https://origin.cursor.com/{codebase}/congress-tracker.git
```

`{codebase}` is the Origin namespace claimed at [cursor.com/codebase](https://cursor.com/codebase).

## Local remotes

`origin` in this repo is GitHub today. Add Origin as a second remote; do not
overwrite GitHub:

```bash
ORIGIN_REPO_URL=https://origin.cursor.com/{codebase}/congress-tracker.git \
  npm run remotes:origin
```

That adds a `cursor` remote when missing and refuses to drop GitHub. Check
status anytime with `npm run remotes:origin`.

If you cloned from Origin instead of GitHub, the same command adds a `github`
remote pointing at `https://github.com/dylanfernandezdelara/congress-tracker.git`.

Push a feature branch to whichever remote you are working from. On a GitHub
mirror, an Origin push still lands on GitHub and Cloudflare still builds.

## Cloud agents and automations

- Keep the GitHub repo attached to the Cursor Cloud environment so existing
  agent checkouts and Workers Builds credentials keep working.
- Attach the Origin copy as well so agents can open Origin pull requests.
- Point [automations](https://cursor.com/docs/origin/integrations.md) at either
  host. Production still ships only when the commit reaches GitHub `main`.

## What not to do

- **Do not Detach from GitHub.** That converts the Origin copy into a standalone
  repo. Pushes no longer flow to GitHub, and Workers Builds will not see them.
- **Do not reconnect Workers Builds to Origin.** Cloudflare cannot use Origin as
  a git provider. Leave the trigger on the GitHub repository.
- **Do not remove `.github/workflows/ci.yml`.** Viewport QA and thermonuclear
  review stay in Cursor; GitHub CI still verifies tests and public-readiness.
- **Do not treat dual-push remotes as a substitute for the mirror** unless you
  created a native Origin repo by mistake. If that happened, re-run **Sync from
  GitHub** (or add the GitHub remote and keep pushing `main` there) before
  merging production work.

## Production deploy path (unchanged)

```text
git push → GitHub main
        → Cloudflare Workers Builds
        → npm ci + build:web
        → npm --prefix workers/senate_data_worker run deploy
```

Verify the latest production build in **Workers & Pages → congress-tracker-api →
Builds**. The build command and deploy command must stay:

```bash
npm ci && npm --prefix workers/senate_data_worker ci && npm --prefix web ci && npm run build:web
npm --prefix workers/senate_data_worker run deploy
```

One-time or drift fix: `npm run configure:cloudflare-builds`. See
[`PREVIEW_DEPLOYMENTS.md`](PREVIEW_DEPLOYMENTS.md).

## Related

- Origin overview: https://cursor.com/docs/origin
- Mirror a GitHub repo: https://cursor.com/docs/origin/mirror-github
- Clone / push / pull: https://cursor.com/docs/origin/git
- Cloudflare git integration: https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/
