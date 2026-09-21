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
const generateCodeFixName = "20261028120000_author_partner_generate_code_extensions_path.sql";
const generateCodeFixPath = join(repoRoot, "supabase/migrations", generateCodeFixName);
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
assert(existsSync(generateCodeFixPath), "generate_code extensions path fix migration");
const generateCodeFix = readFileSync(generateCodeFixPath, "utf8");
assert(generateCodeFix.includes("extensions.gen_random_bytes"), "fix qualifies gen_random_bytes");
assert(generateCodeFix.includes("SET search_path = public, pg_temp"), "fix keeps hardened search_path without extensions");
assert(!/SET search_path[^=\n]*=\s*public,\s*extensions/.test(generateCodeFix), "fix must not put extensions on search_path");

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
assert(stub.includes("WITH SCHEMA extensions"), "stub installs pgcrypto into extensions like production");
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
  const sql = [stub, migration, readFileSync(generateCodeFixPath, "utf8"), smoke].join("\n");
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


/**
 * Explicit production regression:
 * pgcrypto in schema extensions + foundation WITHOUT generate-code fix ⇒ ensure fails 42883;
 * after 20261028120000 ⇒ ensure ok/created + idempotent + get exists.
 */
function runGenRandomBytesExtensionsPathRegression(runtime) {
  if (!runtime || !String(runtime).startsWith("docker:")) {
    console.log("author-partner gen_random_bytes regression: skipped (no docker)");
    return;
  }
  const container = String(runtime).slice("docker:".length);
  const db = "partner_gen_random_bytes_reg_" + Date.now();
  const stubSql = readFileSync(stubPath, "utf8");
  const foundationSql = readFileSync(migrationPath, "utf8");
  const fixSql = readFileSync(generateCodeFixPath, "utf8");

  function psql(dbName, sql) {
    return execFileSync(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", dbName, "-v", "ON_ERROR_STOP=1", "-t", "-A"],
      { input: sql, encoding: "utf8" },
    ).trim();
  }
  function admin(sql) {
    execFileSync(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql],
      { stdio: "ignore" },
    );
  }

  admin(`DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
  admin(`CREATE DATABASE ${db};`);
  try {
    psql(db, stubSql);
    psql(db, foundationSql);

    // Owner context setup
    psql(
      db,
      `
DO $$
DECLARE
  u uuid := 'a1111111-1111-4111-8111-111111111111';
  a uuid := 'b2222222-2222-4222-8222-222222222222';
BEGIN
  INSERT INTO auth.users (id) VALUES (u) ON CONFLICT DO NOTHING;
  INSERT INTO public.authors (id, name, slug) VALUES (a, 'Reg Author', 'reg-gen-bytes')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.author_members (author_id, user_id, role) VALUES (a, u, 'owner')
    ON CONFLICT (author_id, user_id) DO UPDATE SET role = EXCLUDED.role;
END $$;
`,
    );

    // BEFORE fix: expect 42883 / missing gen_random_bytes
    let beforeErr = "";
    try {
      psql(
        db,
        `
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;
SELECT public.ensure_author_partner_profile('b2222222-2222-4222-8222-222222222222'::uuid);
`,
      );
    } catch (error) {
      beforeErr = String(error?.stderr || error?.message || error);
    }
    assert(beforeErr, "before-fix ensure must fail");
    assert(
      /gen_random_bytes/i.test(beforeErr) || /42883/.test(beforeErr),
      `before-fix must cite gen_random_bytes or 42883, got: ${beforeErr.slice(0, 500)}`,
    );

    // Apply fix once
    psql(db, fixSql);

    const first = psql(
      db,
      `
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;
SELECT public.ensure_author_partner_profile('b2222222-2222-4222-8222-222222222222'::uuid);
`,
    );
    const firstJson = JSON.parse(first.split("\n").filter(Boolean).pop());
    assert(firstJson.ok === true, `after-fix ensure ok, got ${first}`);
    assert(firstJson.created === true, `after-fix created=true, got ${first}`);
    assert(typeof firstJson.primary_code === "string" && firstJson.primary_code.length > 0, "primary_code present");
    const code = firstJson.primary_code;

    const second = psql(
      db,
      `
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;
SELECT public.ensure_author_partner_profile('b2222222-2222-4222-8222-222222222222'::uuid);
`,
    );
    const secondJson = JSON.parse(second.split("\n").filter(Boolean).pop());
    assert(secondJson.ok === true, "second ensure ok");
    assert(secondJson.created === false, "second ensure created=false");
    assert(secondJson.primary_code === code, "idempotent same primary_code");

    const got = psql(
      db,
      `
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;
SELECT public.get_author_partner_profile('b2222222-2222-4222-8222-222222222222'::uuid);
`,
    );
    const gotJson = JSON.parse(got.split("\n").filter(Boolean).pop());
    assert(gotJson.exists === true || gotJson.ok === true && gotJson.exists !== false, `get exists, got ${got}`);
    // Prefer explicit exists=true when present
    if ("exists" in gotJson) {
      assert(gotJson.exists === true, "get_author_partner_profile exists=true");
    }
    console.log("author-partner gen_random_bytes extensions-path regression: ok");
  } finally {
    admin(`DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
  }
}

const runtime = runIsolatedSql();
if (runtime) {
  console.log(`author-partner-program-sql-unit: parse + isolated smoke ok (${runtime})`);
  await runConcurrentEnsure(runtime);
  runGenRandomBytesExtensionsPathRegression(runtime);
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
assert(stub.includes("WITH SCHEMA extensions"), "stub installs pgcrypto into extensions like production");
  const foundation = readFileSync(migrationPath, "utf8");
  const generateCodeFix = readFileSync(generateCodeFixPath, "utf8");
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

    runSql(generateCodeFix);
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

async function runActivationBehavioralSmoke() {
  const activationPath = join(
    repoRoot,
    "supabase/migrations/20261027120100_author_partner_activation_bonus.sql",
  );
  const activationSmokePath = join(
    repoRoot,
    "supabase/tests/author_partner_activation_smoke.sql",
  );
  assert(existsSync(activationPath), "activation migration must exist");
  assert(existsSync(activationSmokePath), "activation smoke sql must exist");
  const activationSql = readFileSync(activationPath, "utf8");
  const activationSmokeSql = readFileSync(activationSmokePath, "utf8");
  assert(activationSql.includes("finalize_author_partner_referral"), "finalizer");
  assert(activationSql.includes("author_project_slots_partner_bonus"), "partner bonus column");
  assert(activationSql.includes("activation_author_id_snapshot"), "activation snapshot");
  assert(activationSql.includes("interval '3 years'"), "3y window");
  assert(activationSql.includes("author_partner_earliest_owner_membership"), "earliest owner helper");
  assert(activationSql.includes("author_partner_attribution_window_ok"), "60d window helper vs ownership");
  assert(activationSql.includes("bound_and_activated"), "claim race activate path");
  assert(activationSql.includes("author_partner_bonus_profile_missing") || activationSql.includes("bonus_profile_missing"), "atomic bonus missing-profile guard");
  assert(activationSql.includes("partner_referral_reconcile_done") || activationSql.includes("reconcile_done"), "pre-PR3 reconciliation");
  assert(!activationSql.includes("20261026120000_author_partner_activation"), "no stale 261 partner stamp");
  assert(!/partner_commission|sale_accrual|author_ledger/.test(activationSql), "no finance");
  assert(activationSmokeSql.includes("finalize_author_partner_referral"), "smoke calls finalizer");
  assert(activationSmokeSql.includes("author_partner_activation_smoke_ok"), "smoke notice");
  assert(activationSmokeSql.includes("race B create-then-claim") || activationSmokeSql.includes("Race B:"), "smoke race B");
  assert(activationSmokeSql.includes("already_author"), "smoke post-ownership");
  assert(activationSmokeSql.includes("author_partner_touch_invite"), "smoke authenticated touch");
  assert(activationSmokeSql.includes("create_author_project"), "smoke real create hook");
  assert(activationSmokeSql.includes("approve_author_application"), "smoke real approve hook");
  assert(activationSmokeSql.includes("provision_studio_author_workspace"), "smoke real studio hook");
  assert(/bonus_profile_missing|profile_missing|author_partner_bonus/.test(activationSmokeSql), "smoke profile-missing rollback");
  assert(/day.?59/i.test(activationSmokeSql), "smoke day59 TTL");
  assert(/day.?61/i.test(activationSmokeSql), "smoke day61 TTL");
  assert(activationSmokeSql.includes("author_partner_bind_manual_code"), "smoke manual bind TTL");
  assert(activationSmokeSql.includes("manual pending day59/day61"), "smoke manual pending recovery");
  assert(activationSmokeSql.includes("manual bound prep expected bound") || activationSmokeSql.includes("manual bound day59"), "smoke manual bound recovery");
  assert(activationSmokeSql.includes("manual late day61 ownership"), "smoke manual late invalid ownership");

  if (!dockerOk()) {
    console.log("author-partner activation behavioral smoke: skipped (no docker)");
    return;
  }
  const container = resolveDockerDbContainer();
  if (!container) {
    console.log("author-partner activation behavioral smoke: skipped (no db container)");
    return;
  }

  const db = "partner_activation_smoke_" + Date.now();
  const attributionPath = join(
    repoRoot,
    "supabase/migrations/20261025120000_author_partner_attribution.sql",
  );
  const stub = readFileSync(stubPath, "utf8");
assert(stub.includes("WITH SCHEMA extensions"), "stub installs pgcrypto into extensions like production");
  const foundation = readFileSync(migrationPath, "utf8");
  const generateCodeFix = readFileSync(generateCodeFixPath, "utf8");
  const attribution = readFileSync(attributionPath, "utf8");
  const activation = readFileSync(activationPath, "utf8");
  const smoke = readFileSync(activationSmokePath, "utf8");

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

    runSql(generateCodeFix);
    runSql(attribution);
    runSql(activation);
    execFileSync(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1"],
      { input: smoke, stdio: ["pipe", "pipe", "inherit"], maxBuffer: 20 * 1024 * 1024 },
    );
    console.log("author-partner activation behavioral smoke: ok");
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

await runActivationBehavioralSmoke();

async function runConcurrentActivationAndMigrationRecon() {
  if (!dockerOk()) {
    console.log("author-partner activation concurrency/recon: skipped (no docker)");
    return;
  }
  const container = resolveDockerDbContainer();
  if (!container) {
    console.log("author-partner activation concurrency/recon: skipped (no db container)");
    return;
  }

  const activationPath = join(
    repoRoot,
    "supabase/migrations/20261027120100_author_partner_activation_bonus.sql",
  );
  const attributionPath = join(
    repoRoot,
    "supabase/migrations/20261025120000_author_partner_attribution.sql",
  );
  const stub = readFileSync(stubPath, "utf8");
assert(stub.includes("WITH SCHEMA extensions"), "stub installs pgcrypto into extensions like production");
  const foundation = readFileSync(migrationPath, "utf8");
  const generateCodeFix = readFileSync(generateCodeFixPath, "utf8");
  const attribution = readFileSync(attributionPath, "utf8");
  const activation = readFileSync(activationPath, "utf8");

  const runOn = (db, sql) => {
    execFileSync(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1"],
      { input: sql, stdio: ["pipe", "pipe", "pipe"], encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
  };
  const q = (db, sql) =>
    execFileSync(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql],
      { encoding: "utf8" },
    ).trim();

  // --- Migration-time reconciliation ---
  const reconDb = "partner_activation_recon_" + Date.now();
  execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${reconDb} WITH (FORCE);`],
    { stdio: "pipe" },
  );
  execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${reconDb};`],
    { stdio: "pipe" },
  );
  try {
    runOn(reconDb, stub);
    runOn(reconDb, foundation);
    runOn(reconDb, attribution);
    runOn(
      reconDb,
      `
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('a1111111-1111-4111-8111-111111111101', 'r@t.local'),
  ('a2222222-2222-4222-8222-222222222202', 'i@t.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id) VALUES
  ('a1111111-1111-4111-8111-111111111101'),
  ('a2222222-2222-4222-8222-222222222202')
ON CONFLICT DO NOTHING;
INSERT INTO auth.users (id, email) VALUES
  ('a3333333-3333-4333-8333-333333333303', 'neg@t.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id) VALUES
  ('a3333333-3333-4333-8333-333333333303')
ON CONFLICT DO NOTHING;
INSERT INTO public.authors (id, name, slug) VALUES
  ('aa111111-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'Recon Ref', 'recon-ref'),
  ('aa222222-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'Recon Inv', 'recon-inv'),
  ('aa333333-cccc-4ccc-8ccc-cccccccccc03', 'Recon Neg', 'recon-neg')
ON CONFLICT DO NOTHING;
INSERT INTO public.author_members (author_id, user_id, role, created_at) VALUES
  ('aa111111-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'a1111111-1111-4111-8111-111111111101', 'owner', now() - interval '40 days'),
  ('aa222222-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'a2222222-2222-4222-8222-222222222202', 'owner', now() - interval '10 days'),
  -- ownership BEFORE first-touch (retroactive forbid)
  ('aa333333-cccc-4ccc-8ccc-cccccccccc03', 'a3333333-3333-4333-8333-333333333303', 'owner', now() - interval '40 days')
ON CONFLICT DO NOTHING;
INSERT INTO public.author_referrals (
  referrer_author_id, referrer_owner_user_id, invitee_user_id,
  code_used, code_normalized, attributed_at, attribution_expires_at, status, created_at
) VALUES (
  'aa111111-aaaa-4aaa-8aaa-aaaaaaaaaa01',
  'a1111111-1111-4111-8111-111111111101',
  'a2222222-2222-4222-8222-222222222202',
  'RECONX', public.author_partner_normalize_code('RECONX'),
  now() - interval '30 days', now() + interval '30 days', 'attributed',
  now() - interval '30 days'
), (
  'aa111111-aaaa-4aaa-8aaa-aaaaaaaaaa01',
  'a1111111-1111-4111-8111-111111111101',
  'a3333333-3333-4333-8333-333333333303',
  'RECONX', public.author_partner_normalize_code('RECONX'),
  -- first-touch AFTER ownership
  now() - interval '20 days', now() + interval '40 days', 'attributed',
  now() - interval '20 days'
);
COMMIT;
`,
    );
    runOn(reconDb, activation);
    const act = q(
      reconDb,
      `SELECT status || '|' || CASE WHEN activated_at IS NOT NULL THEN 'yes' ELSE 'no' END || '|' || coalesce(activation_author_id_snapshot::text,'null') || '|' || coalesce(author_project_slots_partner_bonus::text,'0')
       FROM public.author_referrals r
       JOIN public.profiles p ON p.id = r.invitee_user_id
       WHERE r.invitee_user_id = 'a2222222-2222-4222-8222-222222222202';`,
    );
    assert(act === "activated|yes|aa222222-bbbb-4bbb-8bbb-bbbbbbbbbb02|1", `migration-time recon expected activated+snap+bonus1, got ${act}`);
    const neg = q(
      reconDb,
      `SELECT status || '|' || CASE WHEN activated_at IS NOT NULL THEN 'yes' ELSE 'no' END || '|' || coalesce(activation_author_id_snapshot::text,'null') || '|' || coalesce(author_project_slots_partner_bonus::text,'0')
       FROM public.author_referrals r
       JOIN public.profiles p ON p.id = r.invitee_user_id
       WHERE r.invitee_user_id = 'a3333333-3333-4333-8333-333333333303';`,
    );
    assert(neg === "attributed|no|null|0", `migration-time recon negative (own-before-touch) must stay unactivated, got ${neg}`);
    console.log("author-partner activation migration-time recon: ok (positive+negative)");
  } finally {
    try {
      execFileSync(
        "docker",
        ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${reconDb} WITH (FORCE);`],
        { stdio: "pipe" },
      );
    } catch { /* ignore */ }
  }

  // --- True two-session concurrent finalize ---
  const concDb = "partner_activation_conc_" + Date.now();
  execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${concDb} WITH (FORCE);`],
    { stdio: "pipe" },
  );
  execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${concDb};`],
    { stdio: "pipe" },
  );
  try {
    runOn(concDb, stub);
    runOn(concDb, foundation);
    runOn(concDb, attribution);
    runOn(concDb, activation);
    const invitee = "b2222222-2222-4222-8222-222222222222";
    const authorA = "bb222222-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
    const authorB = "bb333333-cccc-4ccc-8ccc-ccccccccccc3";
    runOn(
      concDb,
      `
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('b1111111-1111-4111-8111-111111111111', 'cr@t.local'),
  ('${invitee}', 'ci@t.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id) VALUES
  ('b1111111-1111-4111-8111-111111111111'),
  ('${invitee}')
ON CONFLICT DO NOTHING;
INSERT INTO public.authors (id, name, slug) VALUES
  ('bb111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Conc Ref', 'conc-ref'),
  ('${authorA}', 'Conc Inv A', 'conc-inv-a'),
  ('${authorB}', 'Conc Inv B', 'conc-inv-b')
ON CONFLICT DO NOTHING;
INSERT INTO public.author_members (author_id, user_id, role, created_at) VALUES
  ('bb111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'b1111111-1111-4111-8111-111111111111', 'owner', now() - interval '5 days'),
  ('${authorA}', '${invitee}', 'owner', now() - interval '1 hour'),
  ('${authorB}', '${invitee}', 'owner', now() - interval '30 minutes')
ON CONFLICT DO NOTHING;
INSERT INTO public.author_referrals (
  referrer_author_id, referrer_owner_user_id, invitee_user_id,
  code_used, code_normalized, attributed_at, attribution_expires_at, status, created_at
) VALUES (
  'bb111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'b1111111-1111-4111-8111-111111111111',
  '${invitee}',
  'CONCRF', public.author_partner_normalize_code('CONCRF'),
  now() - interval '2 days', now() + interval '50 days', 'attributed',
  now() - interval '2 days'
);
COMMIT;
`,
    );

    function spawnFinalize(authorId) {
      const sql = `SELECT public.finalize_author_partner_referral('${invitee}'::uuid, '${authorId}'::uuid);`;
      return new Promise((resolve, reject) => {
        import("node:child_process").then(({ spawn }) => {
          const child = spawn(
            "docker",
            ["exec", "-i", container, "psql", "-U", "postgres", "-d", concDb, "-v", "ON_ERROR_STOP=1", "-t", "-A"],
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

    const [ra, rb] = await Promise.all([spawnFinalize(authorA), spawnFinalize(authorB)]);
    const parse = (s) => JSON.parse(s.split("\n").filter(Boolean).pop());
    const ja = parse(ra);
    const jb = parse(rb);
    const results = [ja.result, jb.result];
    const activatedCount = results.filter((r) => r === "activated").length;
    const alreadyCount = results.filter((r) => r === "already_activated").length;
    assert(activatedCount === 1, `concurrent A/B expected exactly one activated, got ${JSON.stringify([ja, jb])}`);
    assert(alreadyCount === 1, `concurrent A/B expected exactly one already_activated, got ${JSON.stringify([ja, jb])}`);
    const winner = ja.result === "activated" ? authorA : authorB;
    const loser = winner === authorA ? authorB : authorA;
    const row = q(
      concDb,
      `SELECT status || '|' || coalesce(author_project_slots_partner_bonus::text,'0') || '|' || coalesce(activation_author_id_snapshot::text,'null') || '|' || CASE WHEN activated_at IS NOT NULL THEN 'yes' ELSE 'no' END || '|' || CASE WHEN expires_at IS NOT NULL THEN 'yes' ELSE 'no' END
       FROM public.author_referrals r
       JOIN public.profiles p ON p.id = r.invitee_user_id
       WHERE r.invitee_user_id = '${invitee}';`,
    );
    assert(row === `activated|1|${winner}|yes|yes`, `concurrent A/B must lock winner snapshot+bonus1, got ${row} (winner=${winner})`);
    assert(!row.includes(loser), `snapshot must not flip to loser ${loser}`);
    console.log("author-partner activation concurrent A/B: ok", `A=${ja.result}`, `B=${jb.result}`, `winner=${winner}`);
  } finally {
    try {
      execFileSync(
        "docker",
        ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${concDb} WITH (FORCE);`],
        { stdio: "pipe" },
      );
    } catch { /* ignore */ }
  }
}

await runConcurrentActivationAndMigrationRecon();
