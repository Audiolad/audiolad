#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAdminAnalyticsSearchParams,
  parseAdminAnalyticsUrlState,
} from "../src/lib/admin/analytics-url-state.ts";
import { formatRubFromMinor } from "../src/lib/admin/analytics-money-format.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

function assertEqual(actual, expected, label) {
  assert(
    actual === expected,
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function testFormat() {
  const formatted = formatRubFromMinor(139400);
  assert(formatted.endsWith("₽"), "ends with ruble");
  assert(formatted.replace(/\D/g, "").startsWith("1394"), "contains 1394");
  assertEqual(formatRubFromMinor(null), "—", "null aov");
  assertEqual(formatRubFromMinor(0), "0 ₽", "zero");
}

function testUrlIsolation() {
  const product = parseAdminAnalyticsUrlState(
    new URLSearchParams("period=yesterday&tab=utm&drill=playStarts"),
  );
  assertEqual(product.view, "product", "default view");
  assertEqual(product.period, "yesterday", "product period");
  assertEqual(product.includeTestPayments, false, "test payments default off");

  const money = parseAdminAnalyticsUrlState(
    new URLSearchParams(
      "view=money&moneyPeriod=30d&includeTestPayments=1&moneyTab=authors&moneyQ=изобил",
    ),
  );
  assertEqual(money.view, "money", "money view");
  assertEqual(money.moneyPeriod, "30d", "money period");
  assertEqual(money.includeTestPayments, true, "test payments on");
  assertEqual(money.moneyTab, "authors", "money tab");
  assertEqual(money.period, "7d", "product period untouched default");

  const built = buildAdminAnalyticsSearchParams(money);
  assertEqual(built.get("view"), "money", "build view");
  assertEqual(built.get("moneyPeriod"), "30d", "build moneyPeriod");
  assertEqual(built.get("includeTestPayments"), "1", "build includeTestPayments");
  assert(built.get("tab") === null || built.get("tab") === undefined || !built.get("tab"), "no forced product tab");
}

function testSourceContracts() {
  const migration = readFileSync(
    join(ROOT, "supabase/migrations/20260725192000_admin_payments_p31_money.sql"),
    "utf8",
  );
  const queries = readFileSync(
    join(ROOT, "src/lib/admin/analytics-money-queries.ts"),
    "utf8",
  );
  const panel = readFileSync(
    join(ROOT, "src/components/admin/AdminMoneyPanel.tsx"),
    "utf8",
  );
  const workbench = readFileSync(
    join(ROOT, "src/components/admin/AdminAnalyticsWorkbench.tsx"),
    "utf8",
  );

  assert(migration.includes("admin_payments_p31_summary"), "summary rpc");
  assert(migration.includes("status = 'succeeded'"), "succeeded SoT");
  assert(migration.includes("p_include_test OR p.is_test = false"), "test filter");
  assert(queries.includes("admin_payments_p31_summary"), "queries call summary");
  assert(queries.includes("formatRubFromMinor"), "money format");
  assert(panel.includes("Включить тестовые платежи"), "test toggle ui");
  assert(panel.includes("audiolad-money-products.csv"), "csv products");
  assert(!panel.includes("payerName"), "no payerName");
  assert(!panel.includes("provider_metadata"), "no provider metadata export");
  assert(workbench.includes('label: "Деньги"'), "money tab switch");
  assert(workbench.includes("AdminMoneyPanel"), "money panel mounted");
}

async function main() {
  testFormat();
  testUrlIsolation();
  testSourceContracts();
  console.log("payments-p31-client-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
