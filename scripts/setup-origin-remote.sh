#!/usr/bin/env bash
# Ensure git remotes keep GitHub (Cloudflare Workers Builds) and optionally
# add a Cursor Origin remote. Never deletes remotes and never overwrites a
# GitHub `origin`.
#
# Cloudflare Workers Builds only supports GitHub/GitLab. Production deploys
# require GitHub to keep receiving commits.
#
# Usage:
#   ./scripts/setup-origin-remote.sh
#   ORIGIN_REPO_URL=https://origin.cursor.com/{codebase}/congress-tracker.git \
#     ./scripts/setup-origin-remote.sh
#
# A bare run prints remotes and adds the GitHub remote if it is missing
# (needed after an Origin-only clone). Set ORIGIN_REPO_URL to add `cursor`.
#
# Optional:
#   GITHUB_REPO_URL=https://github.com/dylanfernandezdelara/congress-tracker.git
#   ORIGIN_REMOTE_NAME=cursor

set -euo pipefail

GITHUB_REPO_URL="${GITHUB_REPO_URL:-https://github.com/dylanfernandezdelara/congress-tracker.git}"
ORIGIN_REPO_URL="${ORIGIN_REPO_URL:-}"
ORIGIN_REMOTE_NAME="${ORIGIN_REMOTE_NAME:-cursor}"

if ! command -v git >/dev/null; then
  echo "error: git is required." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: run this from a git checkout." >&2
  exit 1
fi

sanitize_url() {
  local url="$1"
  if [[ "${url}" == *"@"* && "${url}" == *"://"* ]]; then
    url="${url%%://*}://${url#*@}"
  fi
  printf '%s' "${url}"
}

normalize_remote_url() {
  local url="$1"
  url="${url#https://}"
  url="${url#http://}"
  url="${url#git@}"
  url="${url#ssh://git@}"
  url="${url/://}"
  url="${url%.git}"
  if [[ "${url}" == *"@"* ]]; then
    url="${url#*@}"
  fi
  printf '%s' "${url}"
}

is_github_url() {
  local host
  host="$(normalize_remote_url "$1")"
  [[ "${host}" == github.com/* ]]
}

is_origin_url() {
  local host
  host="$(normalize_remote_url "$1")"
  [[ "${host}" == origin.cursor.com/* ]]
}

remote_url() {
  git remote get-url "$1" 2>/dev/null || true
}

display_remote_url() {
  sanitize_url "$(remote_url "$1")"
}

if ! is_github_url "${GITHUB_REPO_URL}"; then
  echo "error: GITHUB_REPO_URL must be a GitHub URL (github.com)." >&2
  exit 1
fi

has_github_remote=0
has_origin_remote=0
github_remote_name=""
origin_remote_name=""

while IFS= read -r name; do
  [[ -z "${name}" ]] && continue
  url="$(remote_url "${name}")"
  if is_github_url "${url}"; then
    has_github_remote=1
    if [[ -z "${github_remote_name}" ]]; then
      github_remote_name="${name}"
    fi
  elif is_origin_url "${url}"; then
    has_origin_remote=1
    if [[ -z "${origin_remote_name}" ]]; then
      origin_remote_name="${name}"
    fi
  fi
done < <(git remote)

echo "Git remotes (GitHub stays the Cloudflare Workers Builds trigger):"

if [[ "${has_github_remote}" -eq 1 ]]; then
  echo "  GitHub: ${github_remote_name} -> $(display_remote_url "${github_remote_name}")"
else
  echo "  GitHub: missing (will add)"
fi

if [[ "${has_origin_remote}" -eq 1 ]]; then
  echo "  Origin: ${origin_remote_name} -> $(display_remote_url "${origin_remote_name}")"
elif [[ -n "${ORIGIN_REPO_URL}" ]]; then
  echo "  Origin: missing (will add ${ORIGIN_REMOTE_NAME})"
else
  echo "  Origin: missing (set ORIGIN_REPO_URL to add a ${ORIGIN_REMOTE_NAME} remote)"
fi

if [[ "${has_github_remote}" -eq 0 ]]; then
  if git remote get-url origin >/dev/null 2>&1; then
    git remote add github "${GITHUB_REPO_URL}"
    echo "added github -> $(sanitize_url "${GITHUB_REPO_URL}")"
    github_remote_name="github"
  else
    git remote add origin "${GITHUB_REPO_URL}"
    echo "added origin -> $(sanitize_url "${GITHUB_REPO_URL}")"
    github_remote_name="origin"
  fi
  has_github_remote=1
fi

if [[ -n "${ORIGIN_REPO_URL}" ]]; then
  if ! is_origin_url "${ORIGIN_REPO_URL}"; then
    echo "error: ORIGIN_REPO_URL must be an Origin URL (origin.cursor.com)." >&2
    exit 1
  fi
  if [[ "${has_origin_remote}" -eq 0 ]]; then
    if git remote get-url "${ORIGIN_REMOTE_NAME}" >/dev/null 2>&1; then
      echo "error: remote ${ORIGIN_REMOTE_NAME} already exists and is not Origin." >&2
      exit 1
    fi
    git remote add "${ORIGIN_REMOTE_NAME}" "${ORIGIN_REPO_URL}"
    echo "added ${ORIGIN_REMOTE_NAME} -> $(sanitize_url "${ORIGIN_REPO_URL}")"
    origin_remote_name="${ORIGIN_REMOTE_NAME}"
    has_origin_remote=1
  else
    echo "kept existing Origin remote ${origin_remote_name} (not overwritten)"
  fi
fi

echo
echo "Do not Detach from GitHub in Origin settings. That would stop production"
echo "Cloudflare deploys. See docs/ORIGIN.md."
