#!/usr/bin/env node
/**
 * Isolated SQL contract + optional scratch-DB smoke for author partner foundation.
 * Never writes to production postgres.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20261024120000_author_partner_program_foundation.sql";
const migrationPath = join(repoRoot, "supabase/migrations", migrationName);
const stubPath = join(repoRoot, "scripts/lib/author-partner-program-sql-stub.sql");
const smokePath = join(
  repoRoot,
  "supabase/tests/author_partner_program_foundation_smoke.sql",
);
const dbName = "audiolad_author_partner_foundation_test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dockerAvailable() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function localPostgresAvailable() {
  try {
    execFileSync("sudo", ["-n", "-u", "postgres", "psql", "-c", "SELECT 1"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function resolveDockerDbContainer() {
  if (process.env.AUDIOLAD_SUPABASE_DB_CONTAINER?.trim()) {
    return process.env.AUDIOLAD_SUPABASE_DB_CONTAINER.trim();
  }
  const candidates = [
    "supabase-db",
    "audiolad-seo-attach-pg",
    "audiolad-test-db",
  ];
  for (const name of candidates) {
    try {
      execFileSync(
        "docker",
        ["exec", name, "psql", "-U", "postgres", "-c", "SELECT 1"],
        { stdio: "ignore" },
      );
      return name;
    } catch {
      // try next
    }
  }
  return null;
}

const migration = readFileSync(migrationPath, "utf8");

assert(migration.includes("CREATE TABLE IF NOT EXISTS public.author_partner_profiles"), "profiles table");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.author_partner_code_aliases"), "aliases table");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.author_partner_code_claims"), "claims namespace");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.author_referrals"), "referrals table");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.author_partner_reserved_codes"), "reserved codes");
assert(migration.includes("author_partner_code_claims_one_primary_per_author_uidx") || migration.includes("author_partner_code_claims_one_primary_per_author"), "one primary index");
assert(migration.includes("UNIQUE (invitee_user_id)"), "invitee user unique");
assert(migration.includes("invitee_user_id IS DISTINCT FROM referrer_owner_user_id"), "self-ref check");
assert(migration.includes("ENABLE ROW LEVEL SECURITY"), "RLS enabled");
assert(migration.includes("resolve_author_partner_code"), "resolve rpc");
assert(migration.includes("ensure_author_partner_profile"), "ensure rpc");
assert(migration.includes("change_author_partner_code"), "change rpc");
assert(migration.includes("get_author_partner_profile"), "get rpc");
assert(migration.includes("author_partner_assert_not_self_referral"), "self-ref helper");
assert(migration.includes("SET search_path = public, pg_temp"), "search_path lock");
assert(migration.includes("SECURITY DEFINER"), "security definer rpcs");
assert(!/partner_commission|sale_accrual|author_ledger_entries/.test(migration), "must not touch finance ledger");
assert(!/author_project_slots|capacity_grant|author_projects_unlimited/.test(migration), "must not touch capacity");
assert(migration.includes("referrer_author_id"), "referral keyed by author_id");
assert(migration.includes("claim_kind IN ('primary', 'alias')"), "unified claim kinds");

// Hardening contract (PR #522 review fixes)
assert(migration.includes("pg_advisory_xact_lock"), "ensure uses advisory lock");
assert(migration.includes("WHEN unique_violation THEN"), "ensure re-reads on unique_violation");
assert(migration.includes("OLD.activated_at IS NOT NULL"), "immutability keyed on activated_at");
assert(migration.includes("author_partner_is_owner(referrer_author_id)"), "referral RLS author-scoped");
assert(migration.includes("GRANT SELECT ON TABLE public.author_referrals TO authenticated"), "referrals SELECT grant");
assert(
  migration.includes("REVOKE ALL ON FUNCTION public.author_partner_owner_user_id(uuid)")
    && migration.includes("TO service_role"),
  "owner_user_id revoked from clients",
);
assert(migration.includes("author_partner_code_claims_author_code_uidx"), "composite claim uniqueness");
assert(migration.includes("author_partner_profiles_primary_claim_fk"), "profile composite FK");
assert(migration.includes("author_partner_assert_claim_kind"), "claim_kind trigger");
assert(migration.includes("has_partner_referrals_as_referrer"), "delete blocker referrer");
assert(migration.includes("has_partner_referrals_as_invitee"), "delete blocker invitee");
assert(
  !/partner_commission|ledger_credit|capacity_bonus|create table.*partner_payout/i.test(migration),
  "scope freeze: no finance / bonus tables",
);
assert(!/app\/(invite|partner)\//.test(migration), "scope freeze: no invite/partner routes");

const stub = readFileSync(stubPath, "utf8");
assert(stub.includes("CREATE TABLE IF NOT EXISTS public.author_members"), "stub members");
assert(stub.includes("CREATE OR REPLACE FUNCTION auth.uid()"), "stub auth.uid");

const smoke = readFileSync(smokePath, "utf8");
assert(smoke.includes("ensure_author_partner_profile"), "smoke ensure");
assert(smoke.includes("change_author_partner_code"), "smoke change");
assert(smoke.includes("resolve_author_partner_code"), "smoke resolve");
assert(smoke.includes("self-referral") || smoke.includes("self_referral"), "smoke self-ref");
assert(smoke.includes("author_referral_activated_immutable") || smoke.includes("activated referral must be immutable"), "smoke immutability");
assert(smoke.includes("expired referral identity must stay immutable") || smoke.includes("G2:"), "smoke expired immutability");
assert(smoke.includes("new owner after transfer") || smoke.includes("H:"), "smoke ownership transfer RLS");
assert(smoke.includes("authenticated must not execute author_partner_owner_user_id") || smoke.includes("F2:"), "smoke owner_user_id revoke");
assert(smoke.includes("claim_kind=primary") || smoke.includes("I:"), "smoke claim_kind integrity");
assert(smoke.includes("has_partner_referrals_as_referrer"), "smoke delete blockers");

function runIsolatedSql() {
  const sql = [stub, migration, smoke].join("\n");
  const container = dockerAvailable() ? resolveDockerDbContainer() : null;

  if (container) {
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`,
      ],
      { stdio: "ignore" },
    );
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `CREATE DATABASE ${dbName};`,
      ],
      { stdio: "ignore" },
    );
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        dbName,
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql, stdio: ["pipe", "pipe", "inherit"] },
    );
    return `docker:${container}`;
  }

  if (localPostgresAvailable()) {
    execFileSync(
      "sudo",
      [
        "-n",
        "-u",
        "postgres",
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`,
      ],
      { stdio: "ignore" },
    );
    execFileSync(
      "sudo",
      ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${dbName};`],
      { stdio: "ignore" },
    );
    execFileSync(
      "sudo",
      ["-n", "-u", "postgres", "psql", "-d", dbName, "-v", "ON_ERROR_STOP=1"],
      { input: sql, stdio: ["pipe", "pipe", "inherit"] },
    );
    return "local-postgres";
  }

  return null;
}

function runConcurrentEnsure(runtime) {
  if (!runtime || !runtime.startsWith("docker:")) return;
  const container = runtime.slice("docker:".length);
  const setupSql = `
DO $$
DECLARE
  u uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  a uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
BEGIN
  INSERT INTO auth.users (id) VALUES (u) ON CONFLICT DO NOTHING;
  INSERT INTO public.authors (id, name, slug) VALUES (a, 'Concurrent Author', 'concurrent-author')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.author_members (author_id, user_id, role) VALUES (a, u, 'owner')
    ON CONFLICT (author_id, user_id) DO UPDATE SET role = EXCLUDED.role;
END $$;
`;
  execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", dbName, "-v", "ON_ERROR_STOP=1"],
    { input: setupSql, stdio: ["pipe", "pipe", "inherit"] },
  );

  const workerSql = `
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', false);
SET ROLE authenticated;
SELECT public.ensure_author_partner_profile('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid);
`;

  function spawnEnsure() {
    return new Promise((resolve, reject) => {
      import("node:child_process").then(({ spawn }) => {
        const child = spawn(
          "docker",
          ["exec", "-i", container, "psql", "-U", "postgres", "-d", dbName, "-v", "ON_ERROR_STOP=1", "-t", "-A"],
          { stdio: ["pipe", "pipe", "pipe"] },
        );
        let out = "";
        let err = "";
        child.stdout.on("data", (d) => { out += d; });
        child.stderr.on("data", (d) => { err += d; });
        child.on("close", (code) => {
          if (code !== 0) reject(new Error(err || out || `exit ${code}`));
          else resolve(out.trim());
        });
        child.stdin.write(workerSql);
        child.stdin.end();
      }).catch(reject);
    });
  }

  return Promise.all([spawnEnsure(), spawnEnsure()]).then(([a, b]) => {
    const parse = (s) => {
      const line = s.split("\n").filter(Boolean).pop();
      return JSON.parse(line);
    };
    const ja = parse(a);
    const jb = parse(b);
    assert(ja.ok === true && jb.ok === true, "concurrent ensure both ok");
    assert(ja.primary_code && jb.primary_code, "concurrent ensure returned codes");
    assert(ja.primary_code === jb.primary_code, "concurrent ensure same primary_code");
    const createdCount = [ja.created, jb.created].filter(Boolean).length;
    assert(createdCount === 1, `concurrent ensure exactly one created, got ${createdCount}`);

    const cnt = execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        dbName,
        "-t",
        "-A",
        "-c",
        "SELECT count(*) FROM public.author_partner_profiles WHERE author_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid;",
      ],
      { encoding: "utf8" },
    ).trim();
    assert(cnt === "1", `concurrent ensure single profile row, got ${cnt}`);
    console.log("author-partner-program-sql-unit: concurrent ensure ok");
  });
}

const runtime = runIsolatedSql();
if (runtime) {
  console.log(`author-partner-program-sql-unit: parse + isolated smoke ok (${runtime})`);
  await runConcurrentEnsure(runtime);
} else {
  console.log("author-partner-program-sql-unit: parse-only ok (no local postgres)");
}
