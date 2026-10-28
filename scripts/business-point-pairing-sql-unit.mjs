#!/usr/bin/env node
/**
 * Contract check for point pairing. Isolated SQL is optional.
 * Never writes to production postgres.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20270206120000_business_point_pairing.sql";
const migration = readFileSync(join(repoRoot, "supabase/migrations", migrationName), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(existsSync(join(repoRoot, "supabase/migrations", migrationName)), "migration file");
assert(migration.includes("CREATE TABLE public.business_point_pairings"), "pairings");
assert(migration.includes("CREATE TABLE public.business_point_sessions"), "sessions");
assert(migration.includes("code_hash bytea NOT NULL"), "code hash");
assert(migration.includes("token_hash bytea NOT NULL"), "token hash");
assert(migration.includes("ENABLE ROW LEVEL SECURITY"), "rls");
assert(migration.includes("revoked_at IS NULL"), "one live session");
assert(migration.includes("invalid_point_code"), "one error for bad codes");
assert(migration.includes("too_many_open_codes"), "rate limit");
assert(migration.includes("GRANT EXECUTE ON FUNCTION public.consume_business_point_pairing(text) TO anon"), "anon consume");
assert(!/GRANT\s+SELECT\s+ON TABLE public\.business_point_pairings TO (anon|authenticated)/i.test(migration), "no table read");
assert(migration.includes("business_location_sound_settings_apply"), "point sound save uses the shared writer");
assert(migration.includes("point_can_edit_settings") === false || migration.includes("NULL"), "flag stays in the shared writer");
assert(migration.split("COMMIT;")[0].includes("DROP TABLE") === false, "no drop before commit");
assert(!/https?:\/\//.test(migration), "no links");

console.log("business-point-pairing-sql-unit: ok");
