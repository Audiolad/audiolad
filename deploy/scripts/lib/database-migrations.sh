#!/usr/bin/env bash
# Self-hosted supabase-db docker-exec migration preflight/apply for Audiolad deploys.
# Source from deploy.sh. This helper must not take the deploy lock.
# Do not print secrets. Do not require SUPABASE_DB_URL. Do not use supabase db push.

_AUDIOLAD_DBMIG_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
AUDIOLAD_MIGRATIONS_PLANNER="${AUDIOLAD_MIGRATIONS_PLANNER:-$_AUDIOLAD_DBMIG_LIB_DIR/database-migrations-plan.mjs}"

# shellcheck source=self-hosted-db.sh
source "$_AUDIOLAD_DBMIG_LIB_DIR/self-hosted-db.sh"

if ! declare -F log_info >/dev/null 2>&1; then
  log_info() { printf '[INFO] %s\n' "$*"; }
fi
if ! declare -F log_error >/dev/null 2>&1; then
  log_error() { printf '[ERROR] %s\n' "$*" >&2; }
fi

list_local_migration_versions() {
  local release_dir="$1"
  local migrations_dir="$release_dir/supabase/migrations"
  if [[ ! -d "$migrations_dir" ]]; then
    printf '%s\n' "[]"
    return 0
  fi
  node "$AUDIOLAD_MIGRATIONS_PLANNER" from-files "$migrations_dir"
}

list_local_migration_files_json() {
  local release_dir="$1"
  local migrations_dir="$release_dir/supabase/migrations"
  if [[ ! -d "$migrations_dir" ]]; then
    printf '%s\n' '{"files":[],"versions":[],"duplicates":[],"fileCount":0}'
    return 0
  fi
  node "$AUDIOLAD_MIGRATIONS_PLANNER" from-files-detailed "$migrations_dir"
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

_json_field() {
  local json="$1"
  local field="$2"
  node -e '
    const value = JSON.parse(process.argv[1]);
    const field = process.argv[2];
    const found = value[field];
    if (found == null) process.stdout.write("");
    else if (typeof found === "string" || typeof found === "number") process.stdout.write(String(found));
    else process.stdout.write(JSON.stringify(found));
  ' "$json" "$field"
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

_file_for_version() {
  local files_json="$1"
  local version="$2"
  node -e '
    const detailed = JSON.parse(process.argv[1]);
    const version = process.argv[2];
    const files = Array.isArray(detailed.files) ? detailed.files : [];
    const match = files.filter((row) => row.version === version);
    if (match.length !== 1) process.exit(2);
    process.stdout.write(match[0].path || "");
  ' "$files_json" "$version"
}

_name_for_version() {
  local files_json="$1"
  local version="$2"
  node -e '
    const detailed = JSON.parse(process.argv[1]);
    const version = process.argv[2];
    const files = Array.isArray(detailed.files) ? detailed.files : [];
    const match = files.find((row) => row.version === version);
    process.stdout.write((match && match.name) || "");
  ' "$files_json" "$version"
}

apply_pending_migration_file() {
  local file="$1"
  local version="$2"
  local name="$3"
  local insert_sql=""

  if [[ ! -f "$file" ]]; then
    log_error "migration file missing: $file"
    return 1
  fi
  if [[ ! "$version" =~ ^[0-9]{8,}$ ]]; then
    log_error "invalid migration version"
    return 1
  fi
  if ! docker_psql_file "$file"; then
    return 1
  fi
  insert_sql="$(insert_schema_migrations_row_sql "$version" "$name")"
  if ! docker_psql -c "$insert_sql"; then
    return 1
  fi
  return 0
}

run_database_migration_stage() {
  local release_dir="$1"
  local local_json="[]"
  local files_json=""
  local duplicates="[]"
  local history_status=""
  local remote_raw=""
  local remote_json="[]"
  local plan_json=""
  local action=""
  local code=""
  local pending_count="0"
  local pending_json="[]"
  local after_plan=""
  local after_action=""
  local after_pending="1"
  local version=""
  local file=""
  local name=""

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

  if ! preflight_self_hosted_db; then
    log_error "database_migration_failed"
    return 1
  fi

  files_json="$(list_local_migration_files_json "$release_dir")"
  duplicates="$(_json_field "$files_json" "duplicates")"
  if [[ -n "$duplicates" && "$duplicates" != "[]" ]]; then
    log_error "database_migration_failed"
    log_error "database_migration_duplicate_versions"
    return 1
  fi
  local_json="$(list_local_migration_versions "$release_dir")"

  history_status="$(inspect_schema_migrations_table)" || {
    log_error "database_migration_failed"
    log_error "failed to inspect schema_migrations"
    return 1
  }
  history_status="$(printf '%s' "$history_status" | tr -d '[:space:]')"

  if [[ "$history_status" == "missing" || "$history_status" == "empty" ]]; then
    log_error "database_migration_failed"
    log_error "database_migration_history_uninitialized"
    return 1
  fi

  if ! list_remote_migration_versions; then
    log_error "database_migration_failed"
    log_error "failed to list remote migration versions"
    return 1
  fi
  remote_raw="$LAST_PSQL_OUTPUT"
  remote_json="$(parse_remote_versions_json "$remote_raw")"
  plan_json="$(_plan_from_versions "$local_json" "$remote_json")"
  action="$(_plan_field "$plan_json" "action")"
  code="$(_plan_field "$plan_json" "code")"
  pending_count="$(_plan_field "$plan_json" "database_migrations_pending")"
  pending_json="$(_plan_field "$plan_json" "pending")"
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
  while IFS= read -r version; do
    [[ -n "$version" ]] || continue
    file="$(_file_for_version "$files_json" "$version")" || {
      log_error "database_migration_failed"
      log_error "could not resolve file for $version"
      return 1
    }
    name="$(_name_for_version "$files_json" "$version")"
    if ! apply_pending_migration_file "$file" "$version" "$name"; then
      log_error "database_migration_failed"
      return 1
    fi
  done < <(node -e '
    const pending = JSON.parse(process.argv[1] || "[]");
    for (const version of pending) process.stdout.write(String(version) + "\n");
  ' "$pending_json")

  if ! list_remote_migration_versions; then
    log_error "database_migration_failed"
    log_error "failed to list remote migration versions after apply"
    return 1
  fi
  remote_json="$(parse_remote_versions_json "$LAST_PSQL_OUTPUT")"
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
