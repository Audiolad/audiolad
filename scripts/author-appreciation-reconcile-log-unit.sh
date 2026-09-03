#!/usr/bin/env bash
# Unit: reconcile wrapper extracts JSON from npm/tsx output and logs APPRECIATION_RECONCILE.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRAPPER="$ROOT/deploy/scripts/run-author-appreciation-getcourse-reconcile.sh"

extract_reconcile_json() {
  printf '%s\n' "$1" | node -e '
const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").split(/\n/);
let result = null;
for (const raw of lines) {
  const line = raw.trim();
  if (!line.startsWith("{")) continue;
  try {
    const value = JSON.parse(line);
    if (
      value &&
      typeof value.attempted === "number" &&
      typeof value.applied === "number" &&
      typeof value.exports === "number"
    ) {
      result = value;
    }
  } catch {}
}
if (result) process.stdout.write(JSON.stringify(result));
'
}

SAMPLE="$(cat <<'EOF'
> audiolad@0.0.0 run:author-appreciation-getcourse-reconcile
> NODE_OPTIONS='--require ./scripts/cjs-stub-server-only.cjs' npx tsx scripts/run-author-appreciation-getcourse-reconcile.mts
{"attempted":2,"correlatable":2,"applied":0,"skipped":2,"provider_error":false,"deferred":false,"exports":1,"polls":2,"skip_reasons_summary":"not_found:2"}
EOF
)"

PARSED="$(extract_reconcile_json "$SAMPLE")"
if [[ -z "$PARSED" ]]; then
  echo "FAIL could not parse reconcile JSON from npm-prefixed output" >&2
  exit 1
fi

ATTEMPTED="$(printf '%s' "$PARSED" | node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).attempted))')"
CORRELATABLE="$(printf '%s' "$PARSED" | node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).correlatable))')"
APPLIED="$(printf '%s' "$PARSED" | node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).applied))')"
EXPORTS="$(printf '%s' "$PARSED" | node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).exports))')"

if [[ "$ATTEMPTED" != "2" || "$CORRELATABLE" != "2" || "$APPLIED" != "0" || "$EXPORTS" != "1" ]]; then
  echo "FAIL parsed fields attempted=$ATTEMPTED correlatable=$CORRELATABLE applied=$APPLIED exports=$EXPORTS" >&2
  exit 1
fi

if ! grep -q 'APPRECIATION_RECONCILE' "$WRAPPER"; then
  echo "FAIL wrapper missing APPRECIATION_RECONCILE log line" >&2
  exit 1
fi
if grep -q "awk '/\^\\\{.*\"attempted\".*\"applied\".*\"exports\".*\\\}\$/'" "$WRAPPER"; then
  echo "FAIL wrapper still uses brittle awk-only JSON extraction" >&2
  exit 1
fi
if ! grep -q 'extract_reconcile_json' "$WRAPPER"; then
  echo "FAIL wrapper missing extract_reconcile_json helper" >&2
  exit 1
fi

echo "author-appreciation-reconcile-log-unit: ok"
