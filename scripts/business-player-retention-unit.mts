import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BUSINESS_PLAYER_RETENTION_DEFAULT_DAYS, BUSINESS_PLAYER_RETENTION_DAYS_ERROR, runPlayerRetention, type RetentionRpc } from "../src/lib/business-app/player-retention";

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
    }, rpc, log), { message: BUSINESS_PLAYER_RETENTION_DAYS_ERROR });
    assert.equal(calls, before, "invalid config must fail before any RPC");
    assert.equal(logs.length, logCount, "invalid config must not log success");
  }
}
await runPlayerRetention({ BUSINESS_PLAYER_RETENTION_ENABLED: "TRUE", BUSINESS_PLAYER_RETENTION_DELETE_ENABLED: "true" }, async () => {
  assert.fail("enable gate requires literal true");
}, log);

const sql = readFileSync(new URL("../supabase/migrations/20270211120000_business_player_history_retention.sql", import.meta.url), "utf8");
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
console.log("business player retention runner, flags, logging, migration index: PASS");
