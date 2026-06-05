# Shared dotenv helpers for workers/senate_data_worker/.dev.vars (source, do not execute).
#
# wrangler dev reads `.dev.vars` as dotenv; bare `#` starts a comment and only
# double-quoted values may contain spaces or escaped newlines.

# Canonical bridge list — keep AGENTS.md / .dev.vars.example aligned via contract test.
BRIDGED_VARS=(
  DATA_SOURCE
  REPLAY_FIXTURE_SET
  CLOCK
  ALLOWED_ORIGIN
  CONGRESS_API_KEY
  GOVINFO_API_KEY
  PIPELINE_ADMIN_TOKEN
)

dotenv_quote() {
  local v="$1"
  v="${v//$'\r'/}"
  v="${v//\\/\\\\}"
  v="${v//\"/\\\"}"
  v="${v//$'\n'/\\n}"
  printf '"%s"' "${v}"
}

_dev_var_key_pattern() {
  local key="$1"
  printf '^[[:space:]]*%s=' "${key}"
}

remove_dev_var_from_file() {
  local dev_vars="$1" key="$2" tmp
  tmp="$(mktemp)"
  trap 'rm -f "${tmp}"' RETURN
  grep -vE "$(_dev_var_key_pattern "${key}")" "${dev_vars}" >"${tmp}" 2>/dev/null || true
  mv "${tmp}" "${dev_vars}"
}

upsert_dev_var_in_file() {
  local dev_vars="$1" key="$2" value="$3" tmp
  tmp="$(mktemp)"
  trap 'rm -f "${tmp}"' RETURN
  grep -vE "$(_dev_var_key_pattern "${key}")" "${dev_vars}" >"${tmp}" 2>/dev/null || true
  printf '%s=%s\n' "${key}" "$(dotenv_quote "${value}")" >>"${tmp}"
  mv "${tmp}" "${dev_vars}"
}

read_bridged_state() {
  local state_file="$1"
  [[ -f "${state_file}" ]] || return 0
  grep -vE '^[[:space:]]*(#|$)' "${state_file}" 2>/dev/null || true
}

write_bridged_state() {
  local state_file="$1"
  shift
  local key
  : >"${state_file}"
  chmod 600 "${state_file}" 2>/dev/null || true
  for key in "$@"; do
    printf '%s\n' "${key}" >>"${state_file}"
  done
}

is_bridged_var_set() {
  local value="$1"
  [[ -n "${value}" && ! "${value}" =~ ^[[:space:]]+$ ]]
}

bridge_dev_vars_from_env() {
  local dev_vars="$1" state_file="$2"
  local var value bridged_now=() bridged_count=0
  local -A previously_bridged=()

  while IFS= read -r var; do
    [[ -n "${var}" ]] && previously_bridged["${var}"]=1
  done < <(read_bridged_state "${state_file}")

  for var in "${BRIDGED_VARS[@]}"; do
    value="${!var:-}"
    if is_bridged_var_set "${value}"; then
      upsert_dev_var_in_file "${dev_vars}" "${var}" "${value}"
      bridged_now+=("${var}")
      bridged_count=$((bridged_count + 1))
    elif [[ -n "${previously_bridged[${var}]+x}" ]]; then
      remove_dev_var_from_file "${dev_vars}" "${var}"
    fi
  done

  write_bridged_state "${state_file}" "${bridged_now[@]}"
  printf '%s' "${bridged_count}"
}
