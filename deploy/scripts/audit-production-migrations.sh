#!/usr/bin/env bash
# Read-only production migration audit. Never applies SQL. Never writes to the DB.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/self-hosted-db.sh
source "$SCRIPT_DIR/lib/self-hosted-db.sh"

AUDIOLAD_AUDIT_LIB="${AUDIOLAD_AUDIT_LIB:-$SCRIPT_DIR/lib/migration-audit.mjs}"

usage() {
  cat <<'EOF'
Usage: audit-production-migrations.sh [--migrations-dir DIR] [--out FILE] [--fixture FILE]

Builds a JSON report for each supabase/migrations version:
  PROVEN_APPLIED | PROVEN_NOT_APPLIED | REQUIRES_MANUAL_REVIEW

Default: classify from an injected fixture (AUDIOLAD_MIGRATION_AUDIT_FIXTURE or --fixture).
When AUDIOLAD_MIGRATION_AUDIT_EXEC=1, run read-only SELECT probes via docker exec psql.

Never applies migration SQL. Never UPDATE/INSERT/DELETE.
EOF
}

MIGRATIONS_DIR=""
OUT_FILE=""
FIXTURE_FILE="${AUDIOLAD_MIGRATION_AUDIT_FIXTURE:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --migrations-dir)
      MIGRATIONS_DIR="${2:-}"
      shift 2
      ;;
    --out)
      OUT_FILE="${2:-}"
      shift 2
      ;;
    --fixture)
      FIXTURE_FILE="${2:-}"
      shift 2
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

if [[ -z "$MIGRATIONS_DIR" ]]; then
  if [[ -d "${RELEASE_DIR:-}/supabase/migrations" ]]; then
    MIGRATIONS_DIR="$RELEASE_DIR/supabase/migrations"
  else
    MIGRATIONS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd -P)/supabase/migrations"
  fi
fi

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  log_error "migrations directory missing: $MIGRATIONS_DIR"
  exit 1
fi

is_select_sql() {
  local sql="$1"
  node -e '
    const sql = process.argv[1] || "";
    const stripped = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim();
    process.exit(/^(SELECT|WITH)\b/i.test(stripped) ? 0 : 1);
  ' "$sql"
}

RESULTS_FILE=""
if [[ "${AUDIOLAD_MIGRATION_AUDIT_EXEC:-}" == "1" ]]; then
  if ! preflight_self_hosted_db; then
    exit 1
  fi
  RESULTS_FILE="$(mktemp /tmp/audiolad-audit-results.XXXXXX)"
  PROBE_LIST="$(mktemp /tmp/audiolad-audit-probes.XXXXXX)"
  trap 'rm -f "$RESULTS_FILE" "$PROBE_LIST" "$RESULTS_FILE.jsonl"' EXIT
  node "$AUDIOLAD_AUDIT_LIB" list-probes "$MIGRATIONS_DIR" >"$PROBE_LIST"
  : >"$RESULTS_FILE.jsonl"
  mapfile -t PROBE_LINES < <(node -e '
    const fs = require("fs");
    const probes = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    for (const probe of probes) process.stdout.write(JSON.stringify(probe) + "\n");
  ' "$PROBE_LIST")
  for line in "${PROBE_LINES[@]:-}"; do
    [[ -n "$line" ]] || continue
    sql="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).sql || "")' "$line")"
    version="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).version || "")' "$line")"
    id="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).id || "")' "$line")"
    if ! is_select_sql "$sql"; then
      log_error "refusing non-SELECT audit probe"
      exit 1
    fi
    if ! docker_psql_tuples -c "$sql"; then
      log_error "audit probe failed: $id"
      exit 1
    fi
    node -e '
      const fs = require("fs");
      const row = { version: process.argv[1], id: process.argv[2], value: process.argv[3] };
      fs.appendFileSync(process.argv[4], JSON.stringify(row) + "\n");
    ' "$version" "$id" "$(printf '%s' "$LAST_PSQL_OUTPUT" | tr -d "\r" | awk "NF{p=\$0} END{print p}")" "$RESULTS_FILE.jsonl"
  done
  node -e '
    const fs = require("fs");
    const byVersion = {};
    const text = fs.readFileSync(process.argv[1], "utf8");
    for (const line of text.split(/\n/)) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      if (!byVersion[row.version]) byVersion[row.version] = {};
      byVersion[row.version][row.id] = row.value;
    }
    fs.writeFileSync(process.argv[2], JSON.stringify(byVersion));
  ' "$RESULTS_FILE.jsonl" "$RESULTS_FILE"
  FIXTURE_FILE="$RESULTS_FILE"
fi

if [[ -n "$FIXTURE_FILE" ]]; then
  report="$(node "$AUDIOLAD_AUDIT_LIB" build-report "$MIGRATIONS_DIR" "$FIXTURE_FILE")"
else
  report="$(node "$AUDIOLAD_AUDIT_LIB" build-report "$MIGRATIONS_DIR")"
fi

if [[ "${AUDIOLAD_MIGRATION_AUDIT_EXEC:-}" == "1" ]]; then
  report="$(printf '%s' "$report" | node -e '
    let raw = "";
    process.stdin.on("data", (c) => { raw += c; });
    process.stdin.on("end", () => {
      const parsed = JSON.parse(raw);
      parsed.exec = true;
      process.stdout.write(JSON.stringify(parsed, null, 2) + "\n");
    });
  ')"
fi

if [[ -n "$OUT_FILE" ]]; then
  printf '%s\n' "$report" >"$OUT_FILE"
  log_info "wrote $OUT_FILE"
else
  printf '%s\n' "$report"
fi
