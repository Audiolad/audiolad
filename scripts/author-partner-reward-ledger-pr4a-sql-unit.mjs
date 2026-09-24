#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(root, "supabase/migrations/20261103120000_author_partner_reward_ledger_pr4a.sql"),
  "utf8",
);
const stub = readFileSync(
  join(root, "scripts/lib/author-partner-reward-ledger-pr4a-sql-stub.sql"),
  "utf8",
);
const smoke = readFileSync(
  join(root, "supabase/tests/author_partner_reward_ledger_pr4a_smoke.sql"),
  "utf8",
);

function assert(value, message) {
  if (!value) throw new Error(message);
}

assert(migration.includes("author_partner_reward_ledger_entries"), "partner ledger exists");
assert(migration.includes("author_partner_reward_obligations"), "durable queue exists");
assert(migration.includes("partner_reward_floor_v1"), "partner floor policy is versioned");
assert(migration.includes("partner_reward.v1"), "calculation version is explicit");
assert(migration.includes("source_sale_ledger_entry_id"), "sale provenance is retained");
assert(migration.includes("source_event_ledger_entry_id"), "event provenance is retained");
assert(migration.includes("ON DELETE RESTRICT"), "financial FKs are fail-closed");
assert(migration.includes("author_partner_reward_ledger_append_only"), "ledger is append-only");
assert(migration.includes("NEW.entry_type IN ('sale_accrual', 'refund_reversal')"), "only confirmed source types enqueue");
assert(
  migration.includes("WHERE id = v_sale.id\n  FOR UPDATE"),
  "all reconciliation for a source sale uses a canonical sale lock",
);
assert(
  !migration.includes("r.status IN ('activated', 'expired')"),
  "initial eligibility uses immutable activation facts, not mutable referral status",
);
assert(migration.includes("'failed', v_failed"), "partner batch reports failed count");
assert(!migration.includes("INSERT INTO public.author_partner_reward_ledger_entries\nSELECT"), "migration has no backfill");
assert(stub.includes("author_ledger_entries"), "isolated source ledger stub exists");
assert(smoke.includes("expected -667 partner reversal"), "cumulative rounding smoke exists");
assert(smoke.includes("2030-01-01"), "refund after expiry smoke exists");
assert(smoke.includes("'void'"), "void referral delayed sale regression exists");
assert(smoke.includes("out-of-order refund must remain retryable"), "out-of-order retry smoke exists");
assert(smoke.includes("append-only UPDATE"), "immutability smoke exists");

const db = "audiolad_partner_reward_pr4a_test";
try {
  execFileSync("docker", ["exec", "supabase-db", "psql", "-U", "postgres", "-c", "SELECT 1"], { stdio: "ignore" });
  execFileSync("docker", ["exec", "supabase-db", "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS ${db} WITH (FORCE)`], { stdio: "ignore" });
  execFileSync("docker", ["exec", "supabase-db", "psql", "-U", "postgres", "-c", `CREATE DATABASE ${db}`], { stdio: "ignore" });
  execFileSync(
    "docker",
    ["exec", "-i", "supabase-db", "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1"],
    { input: [stub, migration, smoke].join("\n"), stdio: ["pipe", "pipe", "inherit"] },
  );
  execFileSync("docker", ["exec", "supabase-db", "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS ${db} WITH (FORCE)`], { stdio: "ignore" });
  console.log("author-partner-reward-ledger-pr4a-sql-unit: parse + isolated smoke ok");
} catch (error) {
  if (process.env.AUDIOLAD_REQUIRE_PARTNER_REWARD_SQL === "1") throw error;
  console.log("author-partner-reward-ledger-pr4a-sql-unit: parse-only ok");
}
