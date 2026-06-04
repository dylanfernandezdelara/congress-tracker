#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENSURE="${ROOT_DIR}/scripts/ensure-replay-dev-vars.sh"

run_ensure() {
  WORKER_DIR="$1" "${ENSURE}"
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  grep -qE "${pattern}" "${file}"
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

example="${tmpdir}/.dev.vars.example"
cat > "${example}" <<'EOF'
DATA_SOURCE=replay
REPLAY_FIXTURE_SET=canonical
CLOCK=2026-01-20T15:00:00Z
ALLOWED_ORIGIN=*
EOF

worker="${tmpdir}/worker"
mkdir -p "${worker}"
cp "${example}" "${worker}/.dev.vars.example"

# Creates .dev.vars when missing
run_ensure "${worker}"
test -f "${worker}/.dev.vars"
assert_contains "${worker}/.dev.vars" '^DATA_SOURCE=replay$'

# Does not clobber custom CLOCK
cat > "${worker}/.dev.vars" <<'EOF'
DATA_SOURCE=replay
REPLAY_FIXTURE_SET=canonical
CLOCK=2099-01-01T00:00:00Z
EOF
run_ensure "${worker}"
assert_contains "${worker}/.dev.vars" 'CLOCK=2099-01-01T00:00:00Z'

# Respects live mode with trailing comment
cat > "${worker}/.dev.vars" <<'EOF'
DATA_SOURCE=live # production keys configured
REPLAY_FIXTURE_SET=canonical
EOF
before="$(cat "${worker}/.dev.vars")"
run_ensure "${worker}"
after="$(cat "${worker}/.dev.vars")"
if [[ "${before}" != "${after}" ]]; then
  echo "expected live .dev.vars to be unchanged"
  exit 1
fi

# Adds missing replay keys on partial file
cat > "${worker}/.dev.vars" <<'EOF'
DATA_SOURCE=replay
ALLOWED_ORIGIN=*
EOF
run_ensure "${worker}"
assert_contains "${worker}/.dev.vars" '^REPLAY_FIXTURE_SET=canonical$'
assert_contains "${worker}/.dev.vars" '^CLOCK=2026-01-20T15:00:00Z$'

echo "ensure-replay-dev-vars.test.sh: ok"
