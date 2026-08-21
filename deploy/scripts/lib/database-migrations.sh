#!/usr/bin/env bash
# Official Supabase CLI migration preflight/apply for Audiolad deploys.
# Source from deploy.sh. This helper must not take the deploy lock.
# Do not print SUPABASE_DB_URL or other secrets.

SUPABASE_CLI_SPEC="${SUPABASE_CLI_SPEC:-supabase@2.115.0}"

_AUDIOLAD_DBMIG_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
AUDIOLAD_MIGRATIONS_PLANNER="${AUDIOLAD_MIGRATIONS_PLANNER:-$_AUDIOLAD_DBMIG_LIB_DIR/database-migrations-plan.mjs}"

if ! declare -F log_info >/dev/null 2>&1; then
  log_info() { printf '[INFO] %s\n' "$*"; }
fi
if ! declare -F log_error >/dev/null 2>&1; then
  log_error() { printf '[ERROR] %s\n' "$*" >&2; }
fi

SUPABASE_CLI_CMD=()
SUPABASE_DB_URL=""
LAST_SUPABASE_CLI_OUTPUT=""

extract_env_value() {
  local file="$1"
  local key="$2"
  node -e '
    const fs = require("fs");
    const file = process.argv[process.argv.length - 2];
    const key = process.argv[process.argv.length - 1];
    const text = fs.readFileSync(file, "utf8");
    const prefixes = [key + "=", "export " + key + "="];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      let rest = null;
      for (const prefix of prefixes) {
        if (line.startsWith(prefix)) {
          rest = line.slice(prefix.length).trim();
          break;
        }
      }
      if (rest == null) {
        const spaced = line.match(new RegExp("^(?:export\\s+)?" + key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "\\s*=\\s*(.*)$"));
        if (spaced) rest = spaced[1];
      }
      if (rest == null) continue;
      let value = rest;
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'\''") && value.endsWith("'\''"))
      ) {
        value = value.slice(1, -1);
      } else {
        value = value.replace(/\s+#.*$/, "").trim();
      }
      process.stdout.write(value);
      process.exit(0);
    }
    process.exit(0);
  ' "$file" "$key"
}

redact_migration_stream() {
  node "$AUDIOLAD_MIGRATIONS_PLANNER" redact
}

_log_redacted() {
  local text="${1:-}"
  local redacted=""
  redacted="$(printf '%s' "$text" | redact_migration_stream)"
  if [[ -z "$redacted" ]]; then
    return 0
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" ]] && log_info "$line"
  done <<<"$redacted"
}

resolve_supabase_cli() {
  local release_dir="$1"
  local local_bin=""
  local version=""

  if [[ -n "${AUDIOLAD_SUPABASE_CLI:-}" ]]; then
    SUPABASE_CLI_CMD=("$AUDIOLAD_SUPABASE_CLI")
    return 0
  fi

  local_bin="$release_dir/node_modules/.bin/supabase"
  if [[ -x "$local_bin" ]]; then
    version="$("$local_bin" --version 2>/dev/null || true)"
    if [[ "$version" == *2.115.0* ]]; then
      SUPABASE_CLI_CMD=("$local_bin")
      return 0
    fi
  fi

  SUPABASE_CLI_CMD=(npx --yes --package="${SUPABASE_CLI_SPEC}" supabase)
}

list_local_migration_versions() {
  local release_dir="$1"
  local migrations_dir="$release_dir/supabase/migrations"
  if [[ ! -d "$migrations_dir" ]]; then
    printf '%s\n' "[]"
    return 0
  fi
  node "$AUDIOLAD_MIGRATIONS_PLANNER" from-files "$migrations_dir"
}

load_migration_db_url() {
  local env_file="${DEPLOY_ROOT:?DEPLOY_ROOT is required}/shared/.env.production"
  local value=""
  SUPABASE_DB_URL=""
  if [[ ! -f "$env_file" ]]; then
    log_error "database_migration_credentials_missing"
    return 2
  fi
  value="$(extract_env_value "$env_file" "SUPABASE_DB_URL" || true)"
  if [[ -z "$value" ]]; then
    log_error "database_migration_credentials_missing"
    return 2
  fi
  SUPABASE_DB_URL="$value"
  return 0
}

_make_cli_project() {
  local release_dir="$1"
  local tmp=""
  tmp="$(mktemp -d /tmp/audiolad-supabase-cli.XXXXXX)"
  mkdir -p "$tmp/supabase"
  cat >"$tmp/supabase/config.toml" <<'EOF'
project_id = "audiolad"
[db]
major_version = 15
EOF
  ln -sfn "$release_dir/supabase/migrations" "$tmp/supabase/migrations"
  printf '%s\n' "$tmp"
}

_run_supabase_in_release() {
  local release_dir="$1"
  shift
  local tmp=""
  local status=0
  local raw=""
  tmp="$(_make_cli_project "$release_dir")"
  raw="$(
    cd "$tmp"
    "${SUPABASE_CLI_CMD[@]}" "$@" --db-url "$SUPABASE_DB_URL" 2>&1
  )" || status=$?
  rm -rf "$tmp"
  LAST_SUPABASE_CLI_OUTPUT="$raw"
  _log_redacted "$raw"
  return "$status"
}

run_supabase_migration_list() {
  local release_dir="$1"
  _run_supabase_in_release "$release_dir" migration list
}

_plan_from_versions() {
  local local_json="$1"
  local remote_json="$2"
  node -e '
    const { spawnSync } = require("child_process");
    const planner = process.argv[1];
    const payload = JSON.stringify({
      localVersions: JSON.parse(process.argv[2]),
      remoteVersions: JSON.parse(process.argv[3]),
      allowEmptyRemote: false,
    });
    const result = spawnSync(process.execPath, [planner, "plan"], {
      input: payload,
      encoding: "utf8",
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  ' "$AUDIOLAD_MIGRATIONS_PLANNER" "$local_json" "$remote_json"
}

_parse_list_remote_versions() {
  local text="$1"
  printf '%s' "$text" | node "$AUDIOLAD_MIGRATIONS_PLANNER" parse-list | node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      const parsed = JSON.parse(raw || "{}");
      process.stdout.write(JSON.stringify(parsed.remoteVersions || []));
    });
  '
}

_plan_field() {
  local plan_json="$1"
  local field="$2"
  node -e '
    const plan = JSON.parse(process.argv[1]);
    const field = process.argv[2];
    const value = plan[field];
    if (value == null) process.stdout.write("");
    else if (typeof value === "string" || typeof value === "number") process.stdout.write(String(value));
    else process.stdout.write(JSON.stringify(value));
  ' "$plan_json" "$field"
}

_is_current_symlink_path() {
  local release_dir="$1"
  local current="${DEPLOY_ROOT:-}/current"
  local normalized="${release_dir%/}"

  if [[ -z "$release_dir" ]]; then
    return 1
  fi
  if [[ "$normalized" == "$current" ]]; then
    return 0
  fi
  if [[ "$normalized" == */current ]]; then
    return 0
  fi
  if [[ -L "$release_dir" ]]; then
    local base=""
    base="$(basename -- "$release_dir")"
    if [[ "$base" == "current" ]]; then
      return 0
    fi
  fi
  return 1
}

run_database_migration_stage() {
  local release_dir="$1"
  local local_json="[]"
  local list_status=0
  local remote_json="[]"
  local plan_json=""
  local action=""
  local code=""
  local pending_count="0"
  local after_plan=""
  local after_action=""
  local after_pending="1"

  log_info "database_migration_preflight_started"

  if [[ -z "$release_dir" || ! -d "$release_dir" ]]; then
    log_error "database_migration_failed"
    log_error "release directory missing"
    return 1
  fi

  if _is_current_symlink_path "$release_dir"; then
    log_error "database_migration_failed"
    log_error "refusing database migrations via current symlink"
    return 1
  fi

  if [[ ! -d "$release_dir/supabase/migrations" ]]; then
    log_error "database_migration_failed"
    log_error "release missing supabase/migrations"
    return 1
  fi

  if ! load_migration_db_url; then
    log_error "database_migration_failed"
    return 1
  fi

  resolve_supabase_cli "$release_dir"
  local_json="$(list_local_migration_versions "$release_dir")"

  list_status=0
  run_supabase_migration_list "$release_dir" || list_status=$?
  if (( list_status != 0 )); then
    log_error "database_migration_failed"
    log_error "supabase migration list failed"
    return 1
  fi

  remote_json="$(_parse_list_remote_versions "$LAST_SUPABASE_CLI_OUTPUT")"
  plan_json="$(_plan_from_versions "$local_json" "$remote_json")"
  action="$(_plan_field "$plan_json" "action")"
  code="$(_plan_field "$plan_json" "code")"
  pending_count="$(_plan_field "$plan_json" "database_migrations_pending")"
  if [[ -z "$pending_count" ]]; then
    pending_count=0
  fi

  log_info "database_migrations_pending=${pending_count}"

  if [[ "$action" == "abort" ]]; then
    log_error "database_migration_failed"
    log_error "$code"
    return 1
  fi

  if [[ "$action" == "noop" ]]; then
    log_info "database_migrations_pending=0"
    return 0
  fi

  if [[ "$action" != "apply" ]]; then
    log_error "database_migration_failed"
    log_error "unexpected migration plan action"
    return 1
  fi

  log_info "database_migration_apply_started"
  if ! _run_supabase_in_release "$release_dir" db push --yes; then
    log_error "database_migration_failed"
    return 1
  fi

  list_status=0
  run_supabase_migration_list "$release_dir" || list_status=$?
  if (( list_status != 0 )); then
    log_error "database_migration_failed"
    log_error "supabase migration list failed after apply"
    return 1
  fi

  remote_json="$(_parse_list_remote_versions "$LAST_SUPABASE_CLI_OUTPUT")"
  after_plan="$(_plan_from_versions "$local_json" "$remote_json")"
  after_action="$(_plan_field "$after_plan" "action")"
  after_pending="$(_plan_field "$after_plan" "database_migrations_pending")"
  if [[ "$after_action" != "noop" || "$after_pending" != "0" ]]; then
    log_error "database_migration_failed"
    log_error "migrations still pending after apply"
    return 1
  fi

  log_info "database_migration_apply_succeeded"
  log_info "database_migrations_pending_after=0"
  return 0
}
