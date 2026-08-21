#!/usr/bin/env bash
# One-time official schema_migrations baseline. NOT hooked into deploy.sh.
# Default is --dry-run (zero mutations). --apply requires --i-have-backup.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/self-hosted-db.sh
source "$SCRIPT_DIR/lib/self-hosted-db.sh"
AUDIOLAD_AUDIT_LIB="${AUDIOLAD_AUDIT_LIB:-$SCRIPT_DIR/lib/migration-audit.mjs}"

usage() {
  cat <<'EOF'
Usage:
  baseline-schema-migrations.sh --from <audit-report.json> [--dry-run]
  baseline-schema-migrations.sh --from <audit-report.json> --apply --i-have-backup

Registers PROVEN_APPLIED versions into supabase_migrations.schema_migrations.
Does not execute historical migration SQL. Does not UPDATE Olga.
EOF
}

FROM_FILE=""
MODE="dry-run"
HAVE_BACKUP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)
      FROM_FILE="${2:-}"
      shift 2
      ;;
    --dry-run)
      MODE="dry-run"
      shift
      ;;
    --apply)
      MODE="apply"
      shift
      ;;
    --i-have-backup)
      HAVE_BACKUP=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$FROM_FILE" || ! -f "$FROM_FILE" ]]; then
  log_error "audit report missing"
  usage >&2
  exit 1
fi

if [[ "$MODE" == "apply" && "$HAVE_BACKUP" != "1" ]]; then
  log_error "refusing --apply without --i-have-backup"
  exit 1
fi

print_backup_recommendation() {
  local container="${AUDIOLAD_SUPABASE_DB_CONTAINER:-supabase-db}"
  cat <<EOF
Backup recommendation (not executed by this script):
  docker exec $container pg_dump -U postgres -d postgres -Fc -f /tmp/audiolad-pre-baseline.dump
  # or checkpoint the Docker volume used by /opt/supabase/docker
Do not run a dump from this script. Take a backup before --apply.
EOF
}

approved_json="$(node "$AUDIOLAD_AUDIT_LIB" approve-baseline "$FROM_FILE")"

if [[ "$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).ok))' "$approved_json")" != "true" ]]; then
  log_error "$(node -e 'const r=JSON.parse(process.argv[1]); process.stdout.write(r.message || r.code || "baseline refused")' "$approved_json")"
  exit 1
fi

print_backup_recommendation

if ! preflight_self_hosted_db; then
  log_error "database_migration_target_unavailable"
  exit 1
fi

if ! docker_psql_tuples -c "SELECT current_database(), inet_server_addr();"; then
  log_error "database identity check failed"
  exit 1
fi
log_info "database_identity=${LAST_PSQL_OUTPUT}"

if ! docker_psql_tuples -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"; then
  log_error "schema fingerprint failed"
  exit 1
fi
log_info "schema_fingerprint_public_tables=${LAST_PSQL_OUTPUT}"

log_info "versions that WOULD be registered (PROVEN_APPLIED only):"
node -e '
  const approved = JSON.parse(process.argv[1]).approved || [];
  if (approved.length === 0) {
    console.log("(none)");
  } else {
    for (const row of approved) console.log(row.version + " " + (row.file || ""));
  }
' "$approved_json"

if [[ "$MODE" != "apply" ]]; then
  log_info "baseline dry-run complete; zero mutations"
  exit 0
fi

if ! docker_psql -c "$(official_schema_migrations_ddl)"; then
  log_error "failed to create official schema_migrations"
  exit 1
fi

node -e '
  const approved = JSON.parse(process.argv[1]).approved || [];
  for (const row of approved) process.stdout.write(row.version + "\t" + (row.name || "") + "\n");
' "$approved_json" | while IFS=$'\t' read -r version name; do
  [[ -n "$version" ]] || continue
  if ! docker_psql -c "$(insert_schema_migrations_row_sql "$version" "$name")"; then
    log_error "failed to register $version"
    exit 1
  fi
  log_info "registered $version"
done

log_info "baseline apply complete"
