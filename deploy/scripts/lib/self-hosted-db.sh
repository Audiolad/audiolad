#!/usr/bin/env bash
# Shared self-hosted Supabase DB targeting (Timeweb docker).
# Source from deploy/audit/baseline helpers. Never takes the deploy lock.
# Never prints secrets. Never requires SUPABASE_DB_URL.

AUDIOLAD_SUPABASE_DB_CONTAINER="${AUDIOLAD_SUPABASE_DB_CONTAINER:-supabase-db}"
AUDIOLAD_PSQL_USER="${AUDIOLAD_PSQL_USER:-postgres}"
AUDIOLAD_PSQL_DB="${AUDIOLAD_PSQL_DB:-postgres}"

_AUDIOLAD_SELFHOST_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
AUDIOLAD_MIGRATIONS_PLANNER="${AUDIOLAD_MIGRATIONS_PLANNER:-$_AUDIOLAD_SELFHOST_LIB_DIR/database-migrations-plan.mjs}"

if ! declare -F log_info >/dev/null 2>&1; then
  log_info() { printf '[INFO] %s\n' "$*"; }
fi
if ! declare -F log_error >/dev/null 2>&1; then
  log_error() { printf '[ERROR] %s\n' "$*" >&2; }
fi

LAST_PSQL_OUTPUT=""
LAST_PSQL_STATUS=0

docker_bin() {
  if [[ -n "${AUDIOLAD_DOCKER_BIN:-}" ]]; then
    printf '%s\n' "$AUDIOLAD_DOCKER_BIN"
    return 0
  fi
  printf '%s\n' "docker"
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

preflight_self_hosted_db() {
  local bin=""
  local container="${AUDIOLAD_SUPABASE_DB_CONTAINER:-supabase-db}"
  local status=""
  local ping=""
  local ping_status=0

  bin="$(docker_bin)"
  if [[ ! -x "$bin" ]] && ! command -v "$bin" >/dev/null 2>&1; then
    log_error "database_migration_target_unavailable"
    log_error "docker is not available"
    return 2
  fi

  if ! "$bin" inspect "$container" >/dev/null 2>&1; then
    log_error "database_migration_target_unavailable"
    log_error "container missing: $container"
    return 2
  fi

  status="$("$bin" inspect --format '{{.State.Status}}' "$container" 2>/dev/null || true)"
  if [[ "$status" != "running" ]]; then
    log_error "database_migration_target_unavailable"
    log_error "container not running: $container status=${status:-unknown}"
    return 2
  fi

  ping_status=0
  ping="$(
    "$bin" exec "$container" \
      psql -U "$AUDIOLAD_PSQL_USER" -d "$AUDIOLAD_PSQL_DB" -tA -c 'select 1' 2>&1
  )" || ping_status=$?
  LAST_PSQL_OUTPUT="$ping"
  _log_redacted "$ping"
  if (( ping_status != 0 )) || [[ "$(printf '%s' "$ping" | tr -d '[:space:]')" != "1" ]]; then
    log_error "database_migration_target_unavailable"
    log_error "select 1 failed inside $container"
    return 2
  fi
  return 0
}

_docker_psql_raw() {
  local bin=""
  local container="${AUDIOLAD_SUPABASE_DB_CONTAINER:-supabase-db}"
  local status=0
  local raw=""
  local interactive=0
  if [[ "${1:-}" == "--stdin" ]]; then
    interactive=1
    shift
  fi
  bin="$(docker_bin)"
  if (( interactive )); then
    raw="$(
      "$bin" exec -i "$container" \
        psql -U "$AUDIOLAD_PSQL_USER" -d "$AUDIOLAD_PSQL_DB" -v ON_ERROR_STOP=1 "$@" 2>&1
    )" || status=$?
  else
    raw="$(
      "$bin" exec "$container" \
        psql -U "$AUDIOLAD_PSQL_USER" -d "$AUDIOLAD_PSQL_DB" -v ON_ERROR_STOP=1 "$@" 2>&1
    )" || status=$?
  fi
  LAST_PSQL_OUTPUT="$raw"
  LAST_PSQL_STATUS="$status"
  return "$status"
}

docker_psql() {
  local status=0
  _docker_psql_raw "$@" || status=$?
  _log_redacted "$LAST_PSQL_OUTPUT"
  return "$status"
}

docker_psql_tuples() {
  local status=0
  _docker_psql_raw -tA "$@" || status=$?
  return "$status"
}

docker_psql_file() {
  local file="$1"
  local bin=""
  local container="${AUDIOLAD_SUPABASE_DB_CONTAINER:-supabase-db}"
  local status=0
  local raw=""
  bin="$(docker_bin)"
  raw="$(
    "$bin" exec -i "$container" \
      psql -U "$AUDIOLAD_PSQL_USER" -d "$AUDIOLAD_PSQL_DB" -v ON_ERROR_STOP=1 <"$file" 2>&1
  )" || status=$?
  LAST_PSQL_OUTPUT="$raw"
  LAST_PSQL_STATUS="$status"
  _log_redacted "$raw"
  return "$status"
}

inspect_schema_migrations_table() {
  # Prints missing | empty | ready
  local exists=""
  if ! docker_psql_tuples -c "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations');"; then
    return 1
  fi
  exists="$(printf '%s' "$LAST_PSQL_OUTPUT" | tr -d '[:space:]')"
  if [[ "$exists" != "t" && "$exists" != "true" && "$exists" != "1" ]]; then
    printf '%s\n' "missing"
    return 0
  fi
  if ! docker_psql_tuples -c "SELECT count(*) FROM supabase_migrations.schema_migrations;"; then
    return 1
  fi
  if [[ "$(printf '%s' "$LAST_PSQL_OUTPUT" | tr -d '[:space:]')" == "0" ]]; then
    printf '%s\n' "empty"
    return 0
  fi
  printf '%s\n' "ready"
}

list_remote_migration_versions() {
  docker_psql_tuples -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;"
}

parse_remote_versions_json() {
  printf '%s' "${1:-}" | node "$AUDIOLAD_MIGRATIONS_PLANNER" parse-psql-versions
}

sql_literal() {
  local value="${1:-}"
  value="${value//\'/\'\'}"
  printf "'%s'" "$value"
}

official_schema_migrations_ddl() {
  cat <<'SQL'
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
SQL
}

insert_schema_migrations_row_sql() {
  local version="$1"
  local name="${2:-}"
  printf 'INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES (%s, %s) ON CONFLICT (version) DO NOTHING;\n' \
    "$(sql_literal "$version")" \
    "$(sql_literal "$name")"
}
