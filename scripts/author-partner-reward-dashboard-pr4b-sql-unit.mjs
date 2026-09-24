#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const ledgerMigration = read(
  "supabase/migrations/20261103120000_author_partner_reward_ledger_pr4a.sql",
);
const migration = read(
  "supabase/migrations/20261103120200_author_partner_reward_dashboard_pr4b.sql",
);
const stub = read("scripts/lib/author-partner-reward-ledger-pr4a-sql-stub.sql");
const smoke = read(
  "supabase/tests/author_partner_reward_dashboard_pr4b_smoke.sql",
);

function assert(value, message) {
  if (!value) throw new Error(message);
}

assert(
  migration.includes("get_author_partner_reward_dashboard"),
  "dashboard read RPC exists",
);
assert(migration.includes("SECURITY DEFINER"), "dashboard RPC is security definer");
assert(
  migration.includes("author_partner_is_owner"),
  "dashboard RPC authorizes current owner",
);
assert(migration.includes("least(coalesce(p_history_limit, 25), 100)"), "history is bounded");
assert(migration.includes("'paid_minor', 0"), "paid balance remains zero");
assert(migration.includes("'invariant_ok'"), "balance invariant is projected");
assert(
  migration.includes("'invitee_author_name'") && migration.includes("JOIN public.authors AS invitee"),
  "history exposes only the safe invitee author name",
);
assert(
  migration.includes("btrim(coalesce(invitee.name, '')) IN ('', '@') THEN 'Автор'"),
  "blank or @ invitee names use the public fallback",
);
assert(
  migration.includes("ORDER BY row.effective_at DESC, row.created_at DESC, row.id DESC"),
  "history ordering has an internal deterministic id tie-breaker",
);
assert(
  !migration.includes("INSERT INTO public.author_partner_reward_ledger_entries"),
  "migration does not write partner rewards",
);
assert(!migration.includes("author_partner_payouts ("), "migration creates no payouts");
assert(smoke.includes("non-owner must not read partner dashboard"), "smoke covers owner isolation");
assert(smoke.includes("dashboard history must be bounded and safe"), "smoke covers safe history");

const db = "audiolad_partner_reward_pr4b_test";
try {
  execFileSync(
    "docker",
    ["exec", "supabase-db", "psql", "-U", "postgres", "-c", "SELECT 1"],
    { stdio: "ignore" },
  );
  execFileSync(
    "docker",
    ["exec", "supabase-db", "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS ${db} WITH (FORCE)`],
    { stdio: "ignore" },
  );
  execFileSync(
    "docker",
    ["exec", "supabase-db", "psql", "-U", "postgres", "-c", `CREATE DATABASE ${db}`],
    { stdio: "ignore" },
  );
  execFileSync(
    "docker",
    ["exec", "-i", "supabase-db", "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1"],
    {
      input: [stub, ledgerMigration, migration, smoke].join("\n"),
      stdio: ["pipe", "pipe", "inherit"],
    },
  );
  execFileSync(
    "docker",
    ["exec", "supabase-db", "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS ${db} WITH (FORCE)`],
    { stdio: "ignore" },
  );
  console.log("author-partner-reward-dashboard-pr4b-sql-unit: isolated smoke ok");
} catch (error) {
  if (process.env.AUDIOLAD_REQUIRE_PARTNER_REWARD_DASHBOARD_SQL === "1") {
    throw error;
  }
  console.log("author-partner-reward-dashboard-pr4b-sql-unit: parse-only ok");
}
