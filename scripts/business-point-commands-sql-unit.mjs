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

console.log("business-point-commands-sql-unit: ok");
