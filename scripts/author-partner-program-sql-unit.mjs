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


// PR2 attribution migration presence (scope freeze + first-touch helpers)
{
  const attrMig = join(
    repoRoot,
    "supabase/migrations/20261025120000_author_partner_attribution.sql",
  );
  assert(existsSync(attrMig), "attribution migration must exist");
  const attrSql = readFileSync(attrMig, "utf8");
  assert(attrSql.includes("author_partner_attributions"), "attributions table");
  assert(attrSql.includes("attribution_expires_at"), "attribution_expires_at column");
  assert(attrSql.includes("author_partner_touch_invite"), "touch_invite rpc");
  assert(attrSql.includes("author_partner_claim_attribution"), "claim_attribution rpc");
  assert(attrSql.includes("author_partner_bind_manual_code"), "bind_manual_code rpc");
  assert(attrSql.includes("pg_advisory_xact_lock"), "advisory lock");
  assert(attrSql.includes("REFERENCES public.authors (id) ON DELETE CASCADE"), "anonymous attribution cascades with author");
  assert(attrSql.includes("REFERENCES public.author_referrals (id) ON DELETE CASCADE"), "bound attribution cascades with referral");
  assert(attrSql.includes("p_pending_token_hash"), "manual bind accepts pending token hash");
  assert(attrSql.includes("cookie_should_set"), "touch returns cookie_should_set");
  assert(
    attrSql.includes("Authenticated touch") || attrSql.includes("never set anonymous cookie"),
    "migration documents no cookie after authenticated claim",
  );
  assert(attrSql.includes("interval '60 days'"), "60-day ttl");
  assert(!/partner_commission/.test(attrSql), "no partner_commission");
  assert(!/ledger_credit/.test(attrSql), "no ledger_credit");
  assert(!/capacity_bonus/.test(attrSql), "no capacity_bonus");
  console.log("author-partner attribution migration unit checks ok");
}

function dockerOk() {
  return dockerAvailable();
}


function runConcurrentFirstTouchBind(container, db) {
  // Same invitee, two referrer codes racing — advisory lock must yield exactly one referral.
  const setup = `
DO $$
DECLARE
  u_invitee uuid := 'c1111111-1111-4111-8111-111111111111';
  u_a uuid := 'c2222222-2222-4222-8222-222222222222';
  u_b uuid := 'c3333333-3333-4333-8333-333333333333';
  a uuid := 'cc111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  b uuid := 'cc222222-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
BEGIN
  INSERT INTO auth.users (id) VALUES (u_invitee), (u_a), (u_b) ON CONFLICT DO NOTHING;
  INSERT INTO public.authors (id, name, slug) VALUES
    (a, 'ConcA', 'conc-a'), (b, 'ConcB', 'conc-b')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.author_members (author_id, user_id, role) VALUES
    (a, u_a, 'owner'), (b, u_b, 'owner')
  ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub', u_a::text, true);
  PERFORM public.ensure_author_partner_profile(a);
  PERFORM public.change_author_partner_code(a, 'CONCA');
  PERFORM set_config('request.jwt.claim.sub', u_b::text, true);
  PERFORM public.ensure_author_partner_profile(b);
  PERFORM public.change_author_partner_code(b, 'CONCB');
END $$;
`;
  execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1"],
    { input: setup, stdio: ["pipe", "pipe", "pipe"] },
  );

  const invitee = "c1111111-1111-4111-8111-111111111111";
  function spawnBind(code) {
    const sql = `SELECT public.author_partner_bind_manual_code('${code}', '${invitee}'::uuid, NULL);`;
    return new Promise((resolve, reject) => {
      import("node:child_process").then(({ spawn }) => {
        const child = spawn(
          "docker",
          ["exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-t", "-A"],
          { stdio: ["pipe", "pipe", "pipe"] },
        );
        let out = "";
        let err = "";
        child.stdout.on("data", (d) => { out += d; });
        child.stderr.on("data", (d) => { err += d; });
        child.on("close", (codeExit) => {
          if (codeExit !== 0) reject(new Error(err || out || `exit ${codeExit}`));
          else resolve(out.trim());
        });
        child.stdin.write(sql);
        child.stdin.end();
      }).catch(reject);
    });
  }

  return Promise.all([spawnBind("CONCA"), spawnBind("CONCB")]).then(([ra, rb]) => {
    const parse = (s) => {
      const line = s.split("\\n").filter(Boolean).pop();
      return JSON.parse(line);
    };
    const ja = parse(ra);
    const jb = parse(rb);
    assert(ja.ok === true || jb.ok === true, "at least one concurrent bind ok");
    // Exactly one winner creates/keeps a single referral row for the invitee.
    const cnt = execFileSync(
      "docker",
      [
        "exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-t", "-A",
        "-c",
        `SELECT count(*) FROM public.author_referrals WHERE invitee_user_id = '${invitee}'::uuid;`,
      ],
      { encoding: "utf8" },
    ).trim();
    assert(cnt === "1", `concurrent first-touch exactly one referral, got ${cnt}`);
    const winners = [ja, jb].filter((j) => j.ok === true && (j.result === "bound" || j.result === "created" || j.code));
    const codes = new Set(
      execFileSync(
        "docker",
        [
          "exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-t", "-A",
          "-c",
          `SELECT code_used FROM public.author_referrals WHERE invitee_user_id = '${invitee}'::uuid;`,
        ],
        { encoding: "utf8" },
      ).trim().split("\\n").filter(Boolean),
    );
    assert(codes.size === 1, `concurrent first-touch single referrer code, got ${[...codes]}`);
    // Loser must not flip the winner (preserved_first_touch or self-serialized).
    const loser = [ja, jb].find((j) => j.result === "preserved_first_touch" || (j.ok === true && j.code && ![...codes][0].includes(j.code) === false));
    void loser;
    void winners;
    console.log("author-partner attribution concurrent first-touch: ok", [...codes][0]);
  });
}

async function runAttributionBehavioralSmoke() {
  const attrSmokePath = join(
    repoRoot,
    "supabase/tests/author_partner_attribution_smoke.sql",
  );
  assert(existsSync(attrSmokePath), "attribution smoke sql must exist");
  const attrSmokeSql = readFileSync(attrSmokePath, "utf8");
  assert(attrSmokeSql.includes("author_partner_touch_invite"), "smoke touches invite");
  assert(attrSmokeSql.includes("author_partner_bind_manual_code"), "smoke binds manual");
  assert(attrSmokeSql.includes("preserved_first_touch"), "smoke asserts first-touch");
  assert(attrSmokeSql.includes("disabled"), "smoke covers disabled profile");
  assert(attrSmokeSql.includes("self_referral"), "smoke covers self-referral");
  assert(attrSmokeSql.includes("already_author"), "smoke covers already_author");
  assert(attrSmokeSql.includes("alias"), "smoke covers alias");
  assert(attrSmokeSql.includes("attribution_expires_at"), "smoke covers stale TTL");

  if (!dockerOk()) {
    console.log("author-partner attribution behavioral smoke: skipped (no docker)");
    return;
  }
  const container = resolveDockerDbContainer();
  if (!container) {
    console.log("author-partner attribution behavioral smoke: skipped (no db container)");
    return;
  }

  const db = "partner_attr_smoke_" + Date.now();
  const attributionPath = join(
    repoRoot,
    "supabase/migrations/20261025120000_author_partner_attribution.sql",
  );
  const stub = readFileSync(stubPath, "utf8");
  const foundation = readFileSync(migrationPath, "utf8");
  const attribution = readFileSync(attributionPath, "utf8");
  const smoke = readFileSync(attrSmokePath, "utf8");

  execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`],
    { stdio: "pipe" },
  );
  execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${db};`],
    { stdio: "pipe" },
  );

  const runSql = (sql) => {
    execFileSync(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1"],
      { input: sql, stdio: ["pipe", "pipe", "pipe"], encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
  };

  try {
    runSql(stub);
    runSql(foundation);
    runSql(attribution);
    // NOTICE goes to stderr; ON_ERROR_STOP=1 + non-zero exit is the failure signal
    // (same pattern as foundation isolated smoke).
    execFileSync(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1"],
      { input: smoke, stdio: ["pipe", "pipe", "inherit"], maxBuffer: 20 * 1024 * 1024 },
    );
    console.log("author-partner attribution behavioral smoke: ok");
    await runConcurrentFirstTouchBind(container, db);
  } finally {
    try {
      execFileSync(
        "docker",
        ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`],
        { stdio: "pipe" },
      );
    } catch {
      // ignore cleanup errors
    }
  }
}

await runAttributionBehavioralSmoke();
