#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

raw_matches="$(
  rg -n \
    --glob '!*.test.ts' \
    --glob '!*.test.tsx' \
    --glob '!package-lock.json' \
    "https?://[A-Za-z0-9._:/?&=%#-]+" \
    README.md SECURITY.md web/src web/README.md web/ARCHITECTURE.md workers/senate_data_worker/src workers/senate_data_worker/*.md scripts 2>/dev/null || true
)"

if [[ -z "${raw_matches}" ]]; then
  echo "Internal reference sweep passed (no URLs found)."
  exit 0
fi

allowed_domains='localhost|127\.0\.0\.1|example\.com|your-site\.example|workers\.dev|cloudflare\.com|github\.com|npmjs\.org|openrouter\.ai|senate\.gov|congress\.gov|api\.congress\.gov|govinfo\.gov|googleapis\.com|opencollective\.com|tidelift\.com|vitejs\.dev'
filtered="$(
  printf '%s\n' "${raw_matches}" | rg -v "${allowed_domains}" || true
)"

if [[ -n "${filtered}" ]]; then
  echo "Potential non-public/internal URL references detected:"
  printf '%s\n' "${filtered}"
  exit 1
fi

echo "Internal reference sweep passed."
