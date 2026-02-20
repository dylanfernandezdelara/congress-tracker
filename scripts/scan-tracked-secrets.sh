#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

PATTERN='(sk-or-v1-[A-Za-z0-9]{20,}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----|(CONGRESS_API_KEY|GOVINFO_API_KEY|OPENROUTER_API_KEY)=)'
matches="$(git grep -nE "${PATTERN}" -- . || true)"

if [[ -n "${matches}" ]]; then
  filtered="$(printf '%s\n' "${matches}" | rg -v 'your_(congress|govinfo|openrouter)_api_key' || true)"
  if [[ -n "${filtered}" ]]; then
    echo "Potential tracked secrets detected:"
    printf '%s\n' "${filtered}"
    exit 1
  fi
fi

echo "Tracked secret scan passed."
