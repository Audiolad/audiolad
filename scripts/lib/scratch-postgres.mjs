/**
 * Runs an SQL smoke test on a throwaway PostgreSQL database:
 * - a scratch DB on a localhost PostgreSQL URL (CI service container),
 *   created and dropped here; or
 * - a disposable initdb cluster on a unix socket in a temp dir.
 * Never targets a remote or production database.
 *
 * runSmoke receives runPsql(input) => stdout.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]"];

function runWithLocalhostUrl(label, rawUrl, runSmoke) {
  const base = new URL(rawUrl);
  if (!LOCAL_HOSTS.includes(base.hostname)) {
    throw new Error(`${label}: SQL smoke only permits a localhost PostgreSQL URL`);
  }
  const dbName = `audiolad_${label.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${process.pid}`;
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
  console.log(`${label}: SQL smoke ok (localhost scratch database)`);
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

function runWithDisposableCluster(label, runSmoke) {
  const bin = findPgBin();
  if (!bin) {
    throw new Error(`${label}: no localhost DATABASE_URL and no initdb/pg_ctl for a disposable cluster`);
  }
  const dir = mkdtempSync(join(tmpdir(), "al-scratch-pg-"));
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
  console.log(`${label}: SQL smoke ok (disposable initdb cluster)`);
}

export function runScratchPostgresSmoke(label, runSmoke, { urlEnv = [] } = {}) {
  if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === "1" && !process.env.CI) {
    console.log(`${label}: SQL smoke skipped (AUDIOLAD_SKIP_ISOLATED_SQL=1)`);
    return;
  }
  const url =
    [...urlEnv, "AUDIOLAD_ANALYTICS_P2_DATABASE_URL"]
      .map((name) => process.env[name]?.trim())
      .find(Boolean) ?? null;
  if (url) {
    runWithLocalhostUrl(label, url, runSmoke);
  } else {
    runWithDisposableCluster(label, runSmoke);
  }
}
