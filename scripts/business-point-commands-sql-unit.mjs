#!/usr/bin/env node
/**
 * Contract check for the venue command queue. Isolated SQL is optional.
 * Never writes to production postgres.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20270207120000_business_point_commands.sql";
const migration = readFileSync(join(repoRoot, "supabase/migrations", migrationName), "utf8");
const applied = migration.split("COMMIT;")[0];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(existsSync(join(repoRoot, "supabase/migrations", migrationName)), "migration file");
assert(applied.includes("CREATE TABLE public.business_point_commands"), "table");
assert(applied.includes("CHECK (type IN ('pause', 'resume', 'next_track'))"), "types");
assert(!applied.includes("set_atmosphere"), "atmosphere stays out of the queue");
assert(applied.includes("ENABLE ROW LEVEL SECURITY"), "rls");
assert(applied.includes("GRANT SELECT, INSERT ON TABLE public.business_point_commands TO authenticated"), "owner read and insert");
assert(!/GRANT\s+UPDATE\s+ON TABLE public\.business_point_commands TO authenticated/i.test(applied), "no owner update");
assert(applied.includes("created_by = auth.uid()"), "insert is the signed-in owner");
assert(applied.includes("claim_business_point_commands"), "claim");
assert(applied.includes("FOR UPDATE SKIP LOCKED"), "one claimer");
assert(applied.includes("list_business_point_commands"), "list");
assert(applied.includes("ack_business_point_command"), "ack");
assert(applied.includes("GRANT EXECUTE ON FUNCTION public.list_business_point_commands(text) TO anon"), "anon list");
assert(applied.includes("GRANT EXECUTE ON FUNCTION public.claim_business_point_commands(text) TO anon"), "anon claim");
assert(applied.includes("point_command_expired"), "expired is not applied");
assert(applied.includes("ON CONFLICT (id) DO NOTHING"), "repeat id is a no-op");
assert(applied.includes("interval '2 minutes'"), "two minute expiry");
assert(applied.includes("DROP TABLE") === false, "no drop before commit");
assert(!/https?:\/\//.test(migration), "no links");

const fix = readFileSync(join(repoRoot, "supabase/migrations/20270224120000_business_point_commands_ack_after_apply.sql"), "utf8");
const forward = fix.split("COMMIT;")[0];
const claim = forward.split("CREATE FUNCTION public.claim_business_point_commands")[1].split("CREATE FUNCTION public.ack_business_point_command")[0];
assert(!/SET acked_at|ack_result = 'applied'/.test(claim), "claim never acknowledges");
assert(claim.includes("FOR UPDATE SKIP LOCKED") && claim.includes("pg_try_advisory_xact_lock"), "exclusive claim");
assert(claim.includes("LIMIT 1") && claim.includes("interval '30 seconds'"), "one leased row, no batch lease expiry");
assert(claim.includes("claim_id = gen_random_uuid()"), "new fence on each attempt");
assert(forward.includes("v_row.claimed_by IS DISTINCT FROM v_session OR v_row.claim_id IS DISTINCT FROM p_claim_id"), "ack requires current claim + session");
assert(forward.includes("point_command_claim_expired") && forward.includes("point_command_expired"), "no expired ack");
assert(forward.includes("DROP FUNCTION public.ack_business_point_command(text, uuid, text)"), "remove legacy ack bypass");
assert(forward.includes("REVOKE INSERT ON TABLE public.business_point_commands FROM authenticated"), "no forged owner ack inserts");
assert(forward.includes("REVOKE ALL ON FUNCTION public.ack_business_point_command(text, uuid, text, uuid) FROM PUBLIC"), "ack grants explicit");
assert(fix.includes("-- Rollback:") && fix.includes("-- ALTER TABLE public.business_point_commands DROP COLUMN"), "executable commented rollback");
console.log("business-point-commands-sql-unit: ok");
