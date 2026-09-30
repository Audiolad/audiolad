#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="audiolad-scheduled-product-publisher"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_TREE="${DEPLOY_TREE:-$(cd -- "$SCRIPT_DIR/.." && pwd)}"
ECOSYSTEM="${SCHEDULED_PRODUCT_PUBLISHER_ECOSYSTEM:-$DEPLOY_TREE/scheduled-product-publisher.ecosystem.config.cjs}"

if [[ ! -f "$ECOSYSTEM" ]]; then
  echo "scheduled_product_publisher_ecosystem_missing path=$ECOSYSTEM" >&2
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "scheduled_product_publisher_pm2_missing" >&2
  exit 1
fi

# Recreate on each successful cutover so PM2 resolves the new /current tree
# rather than retaining executable paths from the previous release.
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 start "$ECOSYSTEM" --only "$APP_NAME" --update-env >/dev/null

status="$(
  pm2 jlist | node -e '
    let data="";
    process.stdin.on("data", chunk => data += chunk);
    process.stdin.on("end", () => {
      const rows = JSON.parse(data || "[]");
      const row = rows.find(item => item && item.name === process.argv[1]);
      process.stdout.write(row?.pm2_env?.status || "");
    });
  ' "$APP_NAME"
)"

if [[ "$status" != "online" ]]; then
  echo "scheduled_product_publisher_not_online status=${status:-missing}" >&2
  exit 1
fi

echo "scheduled_product_publisher_online app=$APP_NAME"
