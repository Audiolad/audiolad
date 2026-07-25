#!/usr/bin/env node
/**
 * Payments P3.0 integrity checker.
 * Default: dry-run read-only via payment_integrity_snapshot RPC.
 * Never mutates data. Not a public API.
 *
 * Usage:
 *   node scripts/payments-p30-integrity-check.mjs
 *   node scripts/payments-p30-integrity-check.mjs --json
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(path) {
  const env = {};
  let content = "";
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return env;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function main() {
  const asJson = process.argv.includes("--json");
  const env = {
    ...loadEnv(resolve(process.cwd(), ".env.local")),
    ...process.env,
  };
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(2);
  }

  const response = await fetch(`${url}/rest/v1/rpc/payment_integrity_snapshot`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  const text = await response.text();
  if (!response.ok) {
    console.error("integrity_rpc_failed", response.status, text.slice(0, 300));
    process.exit(1);
  }

  const snapshot = JSON.parse(text);
  const critical = {
    duplicate_provider_payment_ids: snapshot.duplicate_provider_payment_ids ?? 0,
    paid_without_succeeded_payment: snapshot.paid_without_succeeded_payment ?? 0,
    paid_without_purchase_access: snapshot.paid_without_purchase_access ?? 0,
    purchase_access_without_paid_order:
      snapshot.purchase_access_without_paid_order ?? 0,
    amount_mismatches: snapshot.amount_mismatches ?? 0,
    // succeeded + pending/paid gaps excluding intentional cancelled/failed review pairs
    succeeded_without_paid_order: snapshot.succeeded_without_paid_order ?? 0,
  };

  const criticalTotal = Object.values(critical).reduce((a, b) => a + b, 0);

  if (asJson) {
    console.log(
      JSON.stringify(
        { snapshot, critical, criticalTotal, dryRun: true },
        null,
        2,
      ),
    );
  } else {
    console.log("payments-p30-integrity-check (dry-run)");
    console.log(
      JSON.stringify(
        {
          succeeded_real: snapshot.succeeded_real,
          succeeded_test: snapshot.succeeded_test,
          gross_real_minor: snapshot.gross_real_minor,
          gross_test_minor: snapshot.gross_test_minor,
          cancelled_order_pending_payment:
            snapshot.cancelled_order_pending_payment,
          webhook_requires_review: snapshot.webhook_requires_review,
          webhook_failed: snapshot.webhook_failed,
          critical,
          criticalTotal,
        },
        null,
        2,
      ),
    );
  }

  process.exit(criticalTotal > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
