#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(root, "supabase/migrations/20261104120000_author_partner_invite_template.sql"),
  "utf8",
);

function assert(value, message) {
  if (!value) throw new Error(message);
}

assert(migration.includes("invite_message_template"), "template column");
assert(migration.includes("author_partner_is_owner"), "owner gate");
assert(!migration.includes("author_partner_reward_ledger"), "ledger untouched");
assert(!migration.includes("author_payouts"), "payouts untouched");
assert(migration.includes("GRANT EXECUTE"), "authenticated execute");

function dockerDb() {
  try {
    execFileSync("docker", ["exec", "supabase-db", "psql", "-U", "postgres", "-c", "SELECT 1"], {
      stdio: "ignore",
    });
    return "supabase-db";
  } catch {
    return null;
  }
}

const container = dockerDb();
if (!container) {
  console.log("author-partner-invite-template-sql-unit: parse ok; smoke skipped");
  process.exit(0);
}

const db = `partner_invite_template_${Date.now()}`;
const files = [
  "scripts/lib/author-partner-program-sql-stub.sql",
  "supabase/migrations/20261024120000_author_partner_program_foundation.sql",
  "supabase/migrations/20261028120000_author_partner_generate_code_extensions_path.sql",
  "supabase/migrations/20261104120000_author_partner_invite_template.sql",
  "supabase/tests/author_partner_invite_template_smoke.sql",
];

function psql(database, sql) {
  execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"],
    { input: sql, stdio: ["pipe", "pipe", "pipe"] },
  );
}

try {
  psql("postgres", `DROP DATABASE IF EXISTS ${db} WITH (FORCE); CREATE DATABASE ${db};`);
  for (const file of files) {
    psql(db, readFileSync(join(root, file), "utf8"));
  }
  console.log("author-partner-invite-template-sql-unit: parse + isolated smoke ok");
} finally {
  try {
    psql("postgres", `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
  } catch {
    // scratch cleanup is best-effort
  }
}
