#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_TMP="$(mktemp -d /tmp/audiolad-baseline-unit.XXXXXX)"
FAKE_BIN="$ROOT_TMP/fake-bin"
FAKE_STATE="$ROOT_TMP/fake-state"
REPORT="$ROOT_TMP/report.json"
BASELINE="$SCRIPT_DIR/baseline-schema-migrations.sh"

export FAKE_DOCKER_STATE="$FAKE_STATE"
export AUDIOLAD_DOCKER_BIN="$FAKE_BIN/docker"
export AUDIOLAD_SUPABASE_DB_CONTAINER="supabase-db"

PASS=0
FAIL=0

assert_eq() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected='$expected' actual='$actual')"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local name="$1"
  local needle="$2"
  local haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (missing '$needle')"
    FAIL=$((FAIL + 1))
  fi
}

cleanup() { rm -rf "$ROOT_TMP"; }
trap cleanup EXIT

mkdir -p "$FAKE_BIN" "$FAKE_STATE"
cat >"$FAKE_BIN/docker" <<EOF
#!/usr/bin/env bash
exec node "$SCRIPT_DIR/test-support/fake-docker.mjs" "\$@"
EOF
chmod +x "$FAKE_BIN/docker"

reset_state() {
  rm -rf "$FAKE_STATE"
  mkdir -p "$FAKE_STATE"
  : >"$FAKE_STATE/calls"
  : >"$FAKE_STATE/sql_log"
  : >"$FAKE_STATE/remote"
  echo running >"$FAKE_STATE/container_status"
  echo ok >"$FAKE_STATE/select1"
  echo missing >"$FAKE_STATE/table_status"
  echo 0 >"$FAKE_STATE/history_inserts"
  echo 0 >"$FAKE_STATE/ddl_writes"
  echo 0 >"$FAKE_STATE/apply_count"
  echo supabase-db >"$FAKE_STATE/container_name"
}

write_report() {
  local extra="${1:-}"
  cat >"$REPORT" <<JSON
{
  "format": "audiolad.migration-audit.v1",
  "generatedAt": "2026-08-21T08:00:00.000Z",
  "migrationsDir": "/tmp/unused",
  "exec": false,
  "versions": [
    {
      "version": "20260819183000",
      "file": "20260819183000_studio_guest_handoff.sql",
      "status": "PROVEN_APPLIED",
      "probes": [],
      "evidence": []
    },
    {
      "version": "20260821140000",
      "file": "20260821140000_olga_nevskaya_author_project_limit_override.sql",
      "status": "${extra:-PROVEN_NOT_APPLIED}",
      "probes": [],
      "evidence": []
    }
  ]
}
JSON
}

echo "=== baseline-schema-migrations unit tests ==="

reset_state
write_report "PROVEN_NOT_APPLIED"
echo 1 >"$FAKE_STATE/readonly"
set +e
out="$("$BASELINE" --dry-run --from "$REPORT" 2>&1)"
status=$?
set -e
assert_eq "dry-run status" "0" "$status"
assert_contains "dry-run lists proven" "20260819183000" "$out"
assert_contains "dry-run mentions backup" "pg_dump" "$out"
assert_contains "dry-run identity" "database_identity=" "$out"
assert_contains "dry-run fingerprint" "schema_fingerprint_public_tables=" "$out"
assert_eq "dry-run history inserts" "0" "$(tr -d '[:space:]' <"$FAKE_STATE/history_inserts")"
assert_eq "dry-run ddl writes" "0" "$(tr -d '[:space:]' <"$FAKE_STATE/ddl_writes")"
assert_eq "dry-run apply count" "0" "$(tr -d '[:space:]' <"$FAKE_STATE/apply_count")"
if [[ -f "$FAKE_STATE/mutation_blocks" ]]; then
  mb="$(tr -d '[:space:]' <"$FAKE_STATE/mutation_blocks")"
else
  mb=0
fi
assert_eq "dry-run mutation blocks" "0" "$mb"


reset_state
cat >"$REPORT" <<'JSON'
{
  "format": "audiolad.migration-audit.v1",
  "versions": [
    {
      "version": "20260819183000",
      "file": "20260819183000_ok.sql",
      "status": "REQUIRES_MANUAL_REVIEW"
    }
  ]
}
JSON
echo 1 >"$FAKE_STATE/readonly"
set +e
out="$("$BASELINE" --dry-run --from "$REPORT" 2>&1)"
status=$?
set -e
assert_eq "review refuse status" "1" "$status"
assert_contains "review refuse message" "REQUIRES_MANUAL_REVIEW" "$out"
assert_eq "review refuse inserts" "0" "$(tr -d '[:space:]' <"$FAKE_STATE/history_inserts")"

reset_state
write_report "PROVEN_NOT_APPLIED"
set +e
out="$("$BASELINE" --from "$REPORT" --apply --i-have-backup 2>&1)"
status=$?
set -e
assert_eq "apply status" "0" "$status"
assert_eq "apply history inserts" "1" "$(tr -d '[:space:]' <"$FAKE_STATE/history_inserts")"
assert_contains "apply registered proven only" "20260819183000" "$(cat "$FAKE_STATE/remote")"
if grep -q "20260821140000" "$FAKE_STATE/remote"; then
  echo "FAIL: apply registered PROVEN_NOT_APPLIED Olga"
  FAIL=$((FAIL + 1))
else
  echo "PASS: apply did not register PROVEN_NOT_APPLIED"
  PASS=$((PASS + 1))
fi
if grep -qiE 'update[[:space:]]+public.profiles|olganevska' "$FAKE_STATE/sql_log"; then
  echo "FAIL: apply sent Olga UPDATE"
  FAIL=$((FAIL + 1))
else
  echo "PASS: apply did not UPDATE Olga"
  PASS=$((PASS + 1))
fi

reset_state
cat >"$REPORT" <<'JSON'
{ "format": "not-a-valid-format", "versions": [] }
JSON
set +e
out="$("$BASELINE" --dry-run --from "$REPORT" 2>&1)"
status=$?
set -e
assert_eq "stale format status" "1" "$status"

echo "=== results: pass=${PASS} fail=${FAIL} ==="
if (( FAIL > 0 )); then
  exit 1
fi
exit 0
