import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BUSINESS_PLAYER_RETENTION_DEFAULT_DAYS, BUSINESS_PLAYER_RETENTION_DAYS_ERROR_CODE, runPlayerRetention, type RetentionRpc } from "../src/lib/business-app/player-retention";

assert.equal(BUSINESS_PLAYER_RETENTION_DEFAULT_DAYS, 400);
let calls = 0;
const logs: object[] = [];
const rpc: RetentionRpc = async (args) => {
  assert.equal(args.p_retention_days, 400);
  calls++;
  assert.equal(args.p_batch_size, 500);
  assert.equal(args.p_max_batches, 20);
  return { cutoff: "2026-01-01T00:00:00Z", candidates: 7, deleted: args.p_delete_enabled ? 7 : 0, batches: 0 };
};
const log = (entry: object) => { logs.push(entry); };
await runPlayerRetention({}, rpc, log);
await runPlayerRetention({ BUSINESS_PLAYER_RETENTION_DELETE_ENABLED: "true" }, rpc, log);
assert.equal(calls, 0, "disabled must not connect, count or delete");
await runPlayerRetention({ BUSINESS_PLAYER_RETENTION_ENABLED: "true" }, rpc, log);
assert.deepEqual(logs.at(-1), {
  event: "business_player_retention", mode: "dry-run", cutoff: "2026-01-01T00:00:00Z",
  candidates: 7, deleted: 0, batches: 0,
});
await runPlayerRetention({ BUSINESS_PLAYER_RETENTION_ENABLED: "true", BUSINESS_PLAYER_RETENTION_DELETE_ENABLED: "TRUE" }, rpc, log);
assert.equal((logs.at(-1) as { deleted: number }).deleted, 0, "flags require literal true");
await runPlayerRetention({ BUSINESS_PLAYER_RETENTION_ENABLED: "true", BUSINESS_PLAYER_RETENTION_DELETE_ENABLED: "true" }, rpc, log);
assert.equal((logs.at(-1) as { deleted: number }).deleted, 7);
await assert.rejects(runPlayerRetention({ BUSINESS_PLAYER_RETENTION_ENABLED: "true" }, async () => {
  throw new Error("synthetic RPC failure");
}, log));

let configuredCalls = 0;
for (const days of [30, 180, 3650]) {
  await runPlayerRetention({ BUSINESS_PLAYER_RETENTION_ENABLED: "true", BUSINESS_PLAYER_RETENTION_DAYS: String(days) }, async (args) => {
    configuredCalls++;
    assert.equal(args.p_retention_days, days);
    assert.equal(args.p_delete_enabled, false);
    return { cutoff: null, candidates: 0, deleted: 0, batches: 0 };
  }, log);
}
assert.equal(configuredCalls, 3);
for (const value of ["", " ", "400 ", "29", "3651", "-1", "0", "400.5", "NaN", "Infinity", "1e3", "0x190", "9007199254740993"]) {
  for (const enabled of [undefined, "true"]) {
    const before: number = calls;
    const logCount = logs.length;
    await assert.rejects(runPlayerRetention({
      BUSINESS_PLAYER_RETENTION_ENABLED: enabled,
      BUSINESS_PLAYER_RETENTION_DELETE_ENABLED: "true",
      BUSINESS_PLAYER_RETENTION_DAYS: value,
    }, rpc, log), { message: BUSINESS_PLAYER_RETENTION_DAYS_ERROR_CODE });
    assert.equal(calls, before, "invalid config must fail before any RPC");
    assert.equal(logs.length, logCount, "invalid config must not log success");
  }
}
await runPlayerRetention({ BUSINESS_PLAYER_RETENTION_ENABLED: "TRUE", BUSINESS_PLAYER_RETENTION_DELETE_ENABLED: "true" }, async () => {
  assert.fail("enable gate requires literal true");
}, log);

const sql = readFileSync(new URL("../supabase/migrations/20270215120000_business_player_history_retention.sql", import.meta.url), "utf8");
assert.match(sql, /CREATE INDEX CONCURRENTLY IF NOT EXISTS business_player_listening_history_retention_idx\s+ON public\.business_player_listening_history \(last_confirmed_at, id\)/);
assert.ok(sql.indexOf("CREATE INDEX CONCURRENTLY") < sql.indexOf("\nBEGIN;"), "concurrent index precedes transaction");
assert.match(sql, /CREATE OR REPLACE FUNCTION/);
assert.match(sql, /p_retention_days integer DEFAULT 400/);
assert.match(sql, /p_retention_days IS NULL OR p_retention_days NOT BETWEEN 30 AND 3650/);
assert.match(sql, /p_retention_days \* 24/);
assert.doesNotMatch(sql, /9600/);
assert.match(sql, /SECURITY DEFINER SET search_path = pg_catalog, pg_temp/);
assert.match(sql, /REVOKE ALL ON FUNCTION[^;]+FROM PUBLIC, anon, authenticated/);
assert.match(sql, /GRANT EXECUTE ON FUNCTION[^;]+TO service_role/);
assert.doesNotMatch(sql, /(?:DELETE FROM|UPDATE|TRUNCATE) public\.business_player_(?:playback_state|device_heartbeat)/i);
assert.match(sql, /LIMIT p_batch_size FOR UPDATE SKIP LOCKED/);
// Owner decision 2026-11-03: 400 days, last_confirmed_at only, batches, no archive,
// heartbeats/playback_state untouched. Recorded in SQL; deletion remains opt-in.
assert.doesNotMatch(sql, /PROPOSAL/);
const code = sql.replace(/--.*$/gm, "").replace(/COMMENT ON FUNCTION[\s\S]*?';/, "");
assert.match(sql, /NO archive/);
assert.doesNotMatch(code, /\b(?:INSERT INTO|CREATE TABLE|COPY)\b/i, "no archive table or copy of history rows");
assert.doesNotMatch(code, /first_confirmed_at/, "first_confirmed_at is never a deletion criterion");
assert.doesNotMatch(code, /business_player_(?:playback_state|device_heartbeat)/i, "heartbeats and playback state untouched");
assert.match(sql, /p_enabled boolean DEFAULT false/);
assert.match(sql, /p_delete_enabled boolean DEFAULT false/);
assert.match(sql, /p_batch_size integer DEFAULT 500/);
assert.match(sql, /p_max_batches integer DEFAULT 20/);
assert.match(sql, /p_batch_size NOT BETWEEN 1 AND 500/);
assert.match(sql, /p_max_batches NOT BETWEEN 1 AND 20/);
assert.equal((code.match(/last_confirmed_at < cutoff/g) ?? []).length, 3, "count, selection and delete recheck share one predicate");
assert.doesNotMatch(code, /cron|pg_cron|schedule\(/i, "no schedule registered by the migration");

const rollback = readFileSync(new URL("../supabase/rollbacks/20270215120000_business_player_history_retention.rollback.sql", import.meta.url), "utf8");
assert.match(rollback, /DROP FUNCTION IF EXISTS public\.cleanup_business_player_listening_history\(boolean, boolean, integer, integer, integer\);/);
assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations WHERE version = '20270215120000';/);
assert.match(rollback, /DROP INDEX CONCURRENTLY IF EXISTS public\.business_player_listening_history_retention_idx;/);
assert.ok(rollback.indexOf("COMMIT;") < rollback.indexOf("DROP INDEX CONCURRENTLY"), "concurrent drop runs after the transaction");
assert.doesNotMatch(rollback.replace(/DELETE FROM supabase_migrations\.schema_migrations[^;]+;/, ""), /\b(?:DELETE|UPDATE|TRUNCATE|INSERT)\b/i, "rollback never touches data");

const dryRun = readFileSync(new URL("../docs/business/player-retention-dry-run.sql", import.meta.url), "utf8");
assert.match(dryRun, /BEGIN TRANSACTION READ ONLY;/);
assert.match(dryRun, /ROLLBACK;\s*$/);
assert.doesNotMatch(dryRun.replace(/^--.*$/gm, ""), /\b(?:DELETE|UPDATE|INSERT|TRUNCATE|FOR UPDATE|ANALYZE\))\b/i, "dry-run is read-only, EXPLAIN without ANALYZE");
assert.equal((dryRun.match(/h\.last_confirmed_at < statement_timestamp\(\) - 400 \* 24 \* interval '1 hour'/g) ?? []).length, 2);
assert.match(dryRun, /least\(count\(\*\), 500 \* 20\)/);
// The isolated PostgreSQL harness (temporary private cluster, synthetic rows) runs in CI.
assert.match(readFileSync(new URL("../.github/workflows/business-pr-validation.yml", import.meta.url), "utf8"), /npm run test:business-player-retention\n/);
console.log("business player retention runner, flags, logging, migration index, decision, rollback, dry-run: PASS");
