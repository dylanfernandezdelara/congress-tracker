#!/usr/bin/env bash
# Idempotent bootstrap for Cursor Cloud agents (also safe to run locally).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="${ROOT_DIR}/workers/senate_data_worker"
WEB_DIR="${ROOT_DIR}/web"
DEV_VARS="${WORKER_DIR}/.dev.vars"
DEV_VARS_EXAMPLE="${WORKER_DIR}/.dev.vars.example"

echo "Installing root dependencies (viewport QA tooling)..."
npm --prefix "${ROOT_DIR}" ci

echo "Installing worker dependencies..."
npm --prefix "${WORKER_DIR}" ci

echo "Installing web dependencies..."
npm --prefix "${WEB_DIR}" ci

echo "Installing Playwright Chromium for viewport QA..."
npx --prefix "${ROOT_DIR}" playwright install chromium

# wrangler [assets] needs web/dist to exist. Do not run tsc/vite here — setup
# must stay cheap and must not fail closed on a web typecheck. A real bundle
# comes from `npm run build:web`. Do not clobber an existing dist.
if [[ ! -d "${WEB_DIR}/dist" ]]; then
  echo "Creating placeholder web/dist from web/index.html (wrangler [assets] needs the directory; Vite serves the UI)..."
  mkdir -p "${WEB_DIR}/dist"
  if [[ -f "${WEB_DIR}/index.html" ]]; then
    cp "${WEB_DIR}/index.html" "${WEB_DIR}/dist/index.html"
  else
    cat > "${WEB_DIR}/dist/index.html" <<'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Track Congress</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
EOF
  fi
fi

if ! command -v lsof >/dev/null 2>&1; then
  echo "warning: lsof is not installed; the verify-congress-tracker skill needs it to check ports." >&2
fi

if [[ ! -f "${DEV_VARS}" ]]; then
  echo "Creating ${DEV_VARS} from example..."
  cp "${DEV_VARS_EXAMPLE}" "${DEV_VARS}"
fi

chmod 600 "${DEV_VARS}" 2>/dev/null || true

echo "Cursor Cloud setup complete."
