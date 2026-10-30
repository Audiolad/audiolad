import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runPlayerRetention } from "../src/lib/business-app/player-retention";

let calls = 0;
const logs: object[] = [];
const rpc = async (args: { p_delete_enabled: boolean; p_batch_size: number; p_max_batches: number }) => {
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

const sql = readFileSync(new URL("../supabase/migrations/20270211120000_business_player_history_retention.sql", import.meta.url), "utf8");
assert.match(sql, /CREATE INDEX business_player_listening_history_retention_idx\s+ON public\.business_player_listening_history \(last_confirmed_at, id\)/);
assert.doesNotMatch(sql, /(?:DELETE FROM|UPDATE|TRUNCATE) public\.business_player_(?:playback_state|device_heartbeat)/i);
assert.match(sql, /LIMIT p_batch_size FOR UPDATE SKIP LOCKED/);
console.log("business player retention runner, flags, logging, migration index: PASS");
