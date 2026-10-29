import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
// CI has a PostgreSQL service, but this test needs host server binaries too.
const configured = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" });
const candidates = [process.env.PG_BIN,
  configured.status === 0 ? configured.stdout.trim() : undefined,
  ...(existsSync("/usr/lib/postgresql") ? readdirSync("/usr/lib/postgresql")
    .sort((a, b) => Number(b) - Number(a)).map(version => `/usr/lib/postgresql/${version}/bin`) : []),
];
const required = ["initdb", "postgres", "pg_ctl", "psql"];
const bin = candidates.find(candidate => candidate && required.every(name => existsSync(path.join(candidate, name))));
assert.ok(bin, "Local PostgreSQL server binaries (initdb, postgres, pg_ctl, psql) required. Install PostgreSQL or set PG_BIN; searched pg_config and /usr/lib/postgresql/*/bin. This test never skips.");
assert.notEqual(process.getuid?.(), 0, "Isolated PostgreSQL must run as a non-root user.");
const scratch = mkdtempSync(path.join(tmpdir(), "music-analyzer-queue-"));
const setup = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE SCHEMA storage; CREATE TABLE storage.buckets(
 id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
INSERT INTO auth.users VALUES
 ('10000000-0000-4000-a000-000000000001'),
 ('10000000-0000-4000-a000-000000000002'),
 ('10000000-0000-4000-a000-000000000003');
CREATE FUNCTION public.test_enqueue(n integer, author integer, track integer DEFAULT NULL, dedupe boolean DEFAULT false)
RETURNS public.music_analyzer_runs LANGUAGE plpgsql AS $$
DECLARE run_id uuid := ('20000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid;
BEGIN
 IF dedupe THEN
  RETURN public.enqueue_music_analyzer_run_deduplicated(run_id,
   ('10000000-0000-4000-a000-' || lpad(author::text, 12, '0'))::uuid,
   'test.mp3', lpad(COALESCE(track, n)::text, 64, '0'), 1::bigint, 'audio/mpeg',
   'runs/' || run_id::text || '/test.mp3');
 END IF;
 RETURN public.enqueue_music_analyzer_run(run_id,
  ('10000000-0000-4000-a000-' || lpad(author::text, 12, '0'))::uuid,
  'test.mp3', lpad(COALESCE(track, n)::text, 64, '0'), 1::bigint, 'audio/mpeg',
  'runs/' || run_id::text || '/test.mp3');
END $$;
`;
// Define test_enqueue only after the real table exists.
const setupSplit = setup.indexOf("CREATE FUNCTION");
const smoke = `
DO $$ DECLARE job public.music_analyzer_runs; expected integer; BEGIN
 PERFORM public.test_enqueue(11, 1); PERFORM public.test_enqueue(12, 1);
 PERFORM public.test_enqueue(13, 1); PERFORM public.test_enqueue(21, 2);
 PERFORM public.test_enqueue(22, 2); PERFORM public.test_enqueue(31, 3);
 PERFORM public.test_enqueue(32, 3);
 -- All three authors take turns despite the older backlog of author 1.
 FOREACH expected IN ARRAY ARRAY[11,21,31,12,22,32,13] LOOP
  job := public.claim_music_analyzer_run();
  IF job.id::text <> '20000000-0000-4000-a000-' || lpad(expected::text, 12, '0') THEN
   RAISE EXCEPTION 'fairness: expected %, got %', expected, job.id;
  END IF;
  PERFORM public.fail_music_analyzer_run(job.id, job.lease_token, 'test', true);
 END LOOP;
 IF (public.claim_music_analyzer_run()).id IS NOT NULL THEN RAISE EXCEPTION 'queue not empty'; END IF;
 -- A restart requires no in-memory state; new and waiting authors get their turn.
 PERFORM public.test_enqueue(41, 1); PERFORM public.test_enqueue(42, 1);
 PERFORM public.test_enqueue(43, 1);
 FOREACH expected IN ARRAY ARRAY[41,42,43] LOOP
  job := public.claim_music_analyzer_run();
  IF job.id::text <> '20000000-0000-4000-a000-' || lpad(expected::text, 12, '0') THEN
   RAISE EXCEPTION 'single-author FIFO';
  END IF;
  PERFORM public.fail_music_analyzer_run(job.id, job.lease_token, 'test', true);
 END LOOP;
 -- Retry/release updates the author's service time without rewriting first started_at.
 PERFORM public.test_enqueue(51, 1); job := public.claim_music_analyzer_run();
 PERFORM public.release_music_analyzer_run(job.id, job.lease_token);
 PERFORM public.test_enqueue(52, 2);
 job := public.claim_music_analyzer_run();
 IF job.created_by <> '10000000-0000-4000-a000-000000000002'::uuid THEN
  RAISE EXCEPTION 'released job hogged the queue';
 END IF;
 PERFORM public.fail_music_analyzer_run(job.id, job.lease_token, 'test', true);
 job := public.claim_music_analyzer_run();
 IF job.id <> '20000000-0000-4000-a000-000000000051'::uuid THEN RAISE EXCEPTION 'retry lost'; END IF;
 PERFORM public.fail_music_analyzer_run(job.id, job.lease_token, 'test', true);
END $$;
SELECT 'MUSIC_ANALYZER_QUEUE_OK';
`;
// Explicit diagnostic only for sandboxes that forbid even Unix sockets.
// Default/CI always runs the real concurrent-session test and fails if unavailable.
const singleUserDiagnostic = process.env.PG_SINGLE_USER_DIAGNOSTIC === "1";
let started = false;
function standalone(statement: string) {
  const sqlPath = path.join(scratch, "standalone.sql");
  writeFileSync(sqlPath, statement.split("\n").filter(line => !line.trimStart().startsWith("--")).join(" ") + "\n");
  const fd = openSync(sqlPath, "r");
  try {
    return spawnSync(path.join(bin!, "postgres"), ["--single", "-D", path.join(scratch, "data"), "-c", "exit_on_error=on", "postgres"], { stdio: [fd, "pipe", "pipe"], encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  } finally { closeSync(fd); }
}
function sql(statement: string): string {
  const result = singleUserDiagnostic ? standalone(statement) : spawnSync(path.join(bin!, "psql"), ["-X", "-h", scratch, "-p", "5432", "-U", "analyzer_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", statement], { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  assert.doesNotMatch(result.stderr, /ERROR:|FATAL:/);
  if (singleUserDiagnostic) return [...result.stdout.matchAll(/\t 1: [^=\n]+ = "([^"]*)"/g)].map(match => match[1]).join("\n");
  return result.stdout.trim();
}
function concurrentSql(statement: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(bin!, "psql"), ["-X", "-h", scratch, "-p", "5432", "-U", "analyzer_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", statement], { timeout: 10_000 });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)));
  });
}
try {
  const init = spawnSync(path.join(bin, "initdb"), ["-D", path.join(scratch, "data"), "-U", "analyzer_test", "-A", "trust", "--no-locale", "--no-sync"], { encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  // Private Unix socket only; never use CI service credentials or production.
  if (!singleUserDiagnostic) {
    const start = spawnSync(path.join(bin, "pg_ctl"), ["-D", path.join(scratch, "data"), "-l", path.join(scratch, "postgres.log"), "-o", `-k ${scratch} -h '' -c fsync=off`, "-w", "start"], { encoding: "utf8", timeout: 30_000 });
    assert.equal(start.status, 0, start.stdout + start.stderr + readFileSync(path.join(scratch, "postgres.log"), "utf8"));
    started = true;
  }
  const blocks = [setup.slice(0, setupSplit),
    read("supabase/migrations/20261217120000_music_analyzer_runs_v01.sql"),
    setup.slice(setupSplit),
    read("supabase/migrations/20270208130000_music_analyzer_queue_guards.sql"),
    read("supabase/migrations/20270208130000_music_analyzer_queue_guards.sql"),
    smoke];
  const sqlPath = path.join(scratch, "test.sql");
  writeFileSync(sqlPath, blocks.join("\n"));
  const result = singleUserDiagnostic ? standalone(blocks.join("\n")) : spawnSync(path.join(bin, "psql"), ["-X", "-h", scratch, "-p", "5432", "-U", "analyzer_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", sqlPath], { encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.message ?? result.stdout + result.stderr);
  assert.match(result.stdout, /MUSIC_ANALYZER_QUEUE_OK/);

  // No overloads, original signature/permissions preserved, wrapper service-only.
  assert.equal(sql(`SELECT count(*) FROM pg_proc JOIN pg_namespace ns ON ns.oid = pronamespace
    WHERE ns.nspname = 'public' AND proname IN ('enqueue_music_analyzer_run', 'enqueue_music_analyzer_run_deduplicated')`), "2");
  for (const rpc of ["enqueue_music_analyzer_run", "enqueue_music_analyzer_run_deduplicated"]) {
    const signature = `${rpc}(uuid,uuid,text,text,bigint,text,text)`;
    assert.equal(sql(`SELECT has_function_privilege('service_role', '${signature}', 'EXECUTE')
      AND NOT has_function_privilege('anon', '${signature}', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', '${signature}', 'EXECUTE')`), "t");
  }
  const enqueue = (n: number, author = 1, sha = 101, dedupe = true) =>
    `SELECT (public.test_enqueue(${n}, ${author}, ${sha}, ${dedupe})).id`;
  const first = sql(enqueue(101));
  assert.equal(sql(enqueue(102)), first, "queued duplicate must return existing ID");
  assert.equal(sql("SELECT count(*) FROM music_analyzer_runs WHERE sha256 = lpad('101', 64, '0')"), "1");
  assert.notEqual(sql(enqueue(103, 2)), first, "different requester gets own run");
  assert.notEqual(sql(enqueue(104, 1, 104)), first, "different SHA gets own run");
  sql(`UPDATE music_analyzer_runs SET status = 'processing', lease_token = gen_random_uuid(), lease_expires_at = now() + interval '1 hour' WHERE id = '${first}'`);
  assert.equal(sql(enqueue(105)), first, "processing duplicate must reuse run");
  sql(`SELECT fail_music_analyzer_run(id, lease_token, 'test', true) FROM music_analyzer_runs WHERE id = '${first}'`);
  const afterFailed = sql(enqueue(106));
  assert.notEqual(afterFailed, first, "failed run allows new version");
  sql(`UPDATE music_analyzer_runs SET status = 'processing', lease_token = gen_random_uuid(), lease_expires_at = now() + interval '1 hour' WHERE id = '${afterFailed}'`);
  assert.equal(sql(`SELECT complete_music_analyzer_run(id, lease_token, 'test', '932c4ce', '3750f3b', 'test', NULL, NULL, 'cpu', '{}'::jsonb, '{}'::jsonb,
    '{"candidate_a":false,"instrument_strategy":"checkout_default"}'::jsonb) FROM music_analyzer_runs WHERE id = '${afterFailed}'`), "t");
  assert.notEqual(sql(enqueue(107)), afterFailed, "succeeded run allows new version");
  const legacy = sql(enqueue(108, 1, 101, false));
  assert.notEqual(legacy, sql(enqueue(109, 1, 101, false)), "legacy enqueue still inserts duplicates");
  assert.equal(sql("SELECT count(*) FROM music_analyzer_runs WHERE sha256 = lpad('101', 64, '0') AND created_by = '10000000-0000-4000-a000-000000000001' AND status IN ('queued', 'processing')"), "3");
  assert.equal(sql(enqueue(110)), sql(enqueue(107)), "existing legacy duplicates do not break dedupe");

  if (singleUserDiagnostic) {
    console.error("DIAGNOSTIC ONLY: sequential SQL checks passed; concurrent sessions NOT tested (socket-restricted sandbox). Run without PG_SINGLE_USER_DIAGNOSTIC for required full validation.");
  } else {
    // Two real sessions: hold the first insert uncommitted until the second is
    // waiting on its advisory lock. This tests the post-wait visibility of the row.
    const pendingFirst = concurrentSql(`BEGIN; ${enqueue(201, 1, 201)}; SELECT pg_sleep(1); COMMIT;`);
    // Wait for the row's SHA lock to be held before starting session two.
    const deadline = Date.now() + 5_000;
    while (sql("SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND granted") === "0") {
      assert.ok(Date.now() < deadline, "first enqueue never acquired its advisory lock");
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const pendingSecond = concurrentSql(enqueue(202, 1, 201));
    const [firstOutput, secondId] = await Promise.all([pendingFirst, pendingSecond]);
    assert.ok(firstOutput.includes(secondId), "concurrent duplicate must return first ID");
    assert.equal(sql("SELECT count(*) FROM music_analyzer_runs WHERE sha256 = lpad('201', 64, '0')"), "1");
    console.log("music-analyzer-queue-unit: ok (real isolated PostgreSQL, fairness + dedupe + concurrent sessions)");
  }
} finally {
  if (started) spawnSync(path.join(bin, "pg_ctl"), ["-D", path.join(scratch, "data"), "-m", "immediate", "-w", "stop"], { encoding: "utf8" });
  rmSync(scratch, { recursive: true, force: true });
}
