#!/usr/bin/env node
/**
 * practice-covers storage policies (migration 20270117120000).
 *
 * Static checks always run. The SQL smoke runs on a throwaway database:
 * - a scratch DB on a localhost PostgreSQL from AUDIOLAD_ANALYTICS_P2_DATABASE_URL
 *   (CI service container), created and dropped by this script; or
 * - a disposable initdb cluster on a unix socket in a temp dir.
 * Never targets a remote or production database.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "20270117120000";
const MIGRATION_NAME = `${VERSION}_practice_covers_server_only_cover_writes.sql`;
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------------------------------------------------------------------------
// Static checks
// ---------------------------------------------------------------------------
const migrationsDir = join(ROOT, "supabase/migrations");
const names = readdirSync(migrationsDir).filter((n) => n.endsWith(".sql"));
const versions = names.map((n) => n.match(/^(\d{14})_/)?.[1]).filter(Boolean);
assert(names.includes(MIGRATION_NAME), `missing migration ${MIGRATION_NAME}`);
assert(
  versions.filter((v) => v === VERSION).length === 1,
  `migration version ${VERSION} must be unique`,
);

const migration = read(`supabase/migrations/${MIGRATION_NAME}`);
for (const policy of [
  "Author members can upload practice covers",
  "Author members can update practice covers",
  "Author members can delete practice covers",
]) {
  assert(
    migration.includes(`DROP POLICY IF EXISTS "${policy}" ON storage.objects`),
    `migration must drop "${policy}"`,
  );
}
assert(!/FOR\s+UPDATE/i.test(migration), "migration must not grant UPDATE to authenticated");
assert(!/FOR\s+ALL/i.test(migration), "migration must not use FOR ALL");
assert(
  (migration.match(/split_part\(name, '\/', 3\) = 'gallery'/g) ?? []).length === 2,
  "authenticated write policies must be limited to the gallery prefix",
);
assert(!/Public can read practice covers/.test(migration.replace(/^--.*$/gm, "")), "public read policy must stay untouched");
assert(!/DROP\s+TABLE|TRUNCATE|DELETE\s+FROM/i.test(migration), "migration must not delete data");
assert(
  existsSync(join(ROOT, "docs/security/practice-covers-storage-write-policies.md")),
  "rollback notes must exist",
);

const original = read("supabase/migrations/20260714191000_author_dashboard_storage_and_rls.sql");

function extractOriginalPracticeCoversBlock(sql) {
  const start = sql.indexOf("-- practice-covers bucket");
  const deleteAt = sql.indexOf('"Author members can delete practice covers"', start);
  assert(start >= 0 && deleteAt > start, "original practice-covers block not found");
  const endMarker = "END;\n$$;";
  // The delete policy name appears in the IF NOT EXISTS check and in CREATE POLICY.
  const createAt = sql.indexOf('CREATE POLICY "Author members can delete practice covers"', start);
  const end = sql.indexOf(endMarker, createAt);
  assert(createAt > 0 && end > createAt, "original delete policy block not found");
  return sql.slice(start, end + endMarker.length);
}

const originalBlock = extractOriginalPracticeCoversBlock(original);

console.log("practice-covers-storage-policy-sql-unit: static ok");

// ---------------------------------------------------------------------------
// SQL smoke
// ---------------------------------------------------------------------------
const stub = read("scripts/lib/practice-covers-storage-policy-sql-stub.sql");
const helpers = read("supabase/tests/practice_covers_storage_policy_helpers.sql");
const before = read("supabase/tests/practice_covers_storage_policy_before.sql");
const behavior = read("supabase/tests/practice_covers_storage_policy_behavior.sql");

function runSmoke(runPsql) {
  runPsql([stub, originalBlock, helpers].join("\n"));
  const beforeOut = runPsql(before);
  assert(/practice_covers_storage_policy_before: ALL PASS/.test(beforeOut), "before-state check failed");
  runPsql(migration);
  runPsql(migration); // idempotent re-apply
  const out = runPsql(behavior);
  assert(/practice_covers_storage_policy_behavior: ALL PASS/.test(out), "behavior check failed");
}

const DATABASE_URL =
  process.env.AUDIOLAD_PRACTICE_COVERS_SQL_DATABASE_URL?.trim() ||
  process.env.AUDIOLAD_ANALYTICS_P2_DATABASE_URL?.trim() ||
  null;

function runWithLocalhostUrl(rawUrl) {
  const base = new URL(rawUrl);
  assert(
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(base.hostname),
    "practice-covers SQL smoke only permits a localhost PostgreSQL URL",
  );
  const dbName = `audiolad_practice_covers_policy_${process.pid}`;
  const urlFor = (db) => {
    const url = new URL(base);
    url.pathname = `/${db}`;
    return url.toString();
  };
  const psql = (db, input) =>
    execFileSync("psql", [urlFor(db), "-v", "ON_ERROR_STOP=1", "-q", "-At"], {
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "inherit"],
      maxBuffer: 20 * 1024 * 1024,
    });

  psql("postgres", `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);\nCREATE DATABASE ${dbName};\n`);
  try {
    runSmoke((input) => psql(dbName, input));
  } finally {
    try {
      psql("postgres", `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);\n`);
    } catch (error) {
      console.warn("cleanup warning:", error instanceof Error ? error.message : error);
    }
  }
  console.log("practice-covers-storage-policy-sql-unit: SQL smoke ok (localhost scratch database)");
}

function findPgBin() {
  const candidates = [];
  if (process.env.AUDIOLAD_PG_BINDIR) candidates.push(process.env.AUDIOLAD_PG_BINDIR);
  try {
    candidates.push(execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim());
  } catch {
    /* ignore */
  }
  try {
    for (const v of readdirSync("/usr/lib/postgresql").sort().reverse()) {
      candidates.push(`/usr/lib/postgresql/${v}/bin`);
    }
  } catch {
    /* ignore */
  }
  return (
    candidates.find((dir) => existsSync(join(dir, "initdb")) && existsSync(join(dir, "pg_ctl"))) ??
    null
  );
}

function runWithDisposableCluster() {
  const bin = findPgBin();
  if (!bin) {
    throw new Error("no localhost DATABASE_URL and no initdb/pg_ctl for a disposable cluster");
  }
  const dir = mkdtempSync(join(tmpdir(), "al-practice-covers-pg-"));
  const data = join(dir, "data");
  const port = String(20000 + Math.floor(Math.random() * 30000));
  const psqlBin = existsSync(join(bin, "psql")) ? join(bin, "psql") : "psql";
  let started = false;
  try {
    execFileSync(join(bin, "initdb"), ["-D", data, "-U", "postgres", "-A", "trust", "--no-sync"], {
      stdio: "ignore",
    });
    execFileSync(
      join(bin, "pg_ctl"),
      ["-D", data, "-w", "-l", join(dir, "pg.log"), "-o", `-k ${dir} -p ${port} -c listen_addresses=''`, "start"],
      { stdio: "ignore" },
    );
    started = true;
    runSmoke((input) =>
      execFileSync(
        psqlBin,
        ["-h", dir, "-p", port, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At"],
        { encoding: "utf8", input, stdio: ["pipe", "pipe", "inherit"], maxBuffer: 20 * 1024 * 1024 },
      ),
    );
  } finally {
    if (started) {
      try {
        execFileSync(join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "stop"], { stdio: "ignore" });
      } catch {
        /* ignore */
      }
    }
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("practice-covers-storage-policy-sql-unit: SQL smoke ok (disposable initdb cluster)");
}

if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1" && !process.env.CI) {
  console.log("practice-covers-storage-policy-sql-unit: SQL smoke skipped (AUDIOLAD_SKIP_ISOLATED_SQL=1)");
} else if (DATABASE_URL) {
  runWithLocalhostUrl(DATABASE_URL);
} else {
  runWithDisposableCluster();
}
