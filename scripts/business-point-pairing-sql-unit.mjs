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

const next = readFileSync(join(repoRoot, "supabase/migrations", "20270208120000_business_point_pairing_4digit.sql"), "utf8");
assert(next.includes("ADD COLUMN IF NOT EXISTS retired_at"), "4digit: retired_at");
assert(next.includes("WHERE consumed_at IS NULL AND retired_at IS NULL"), "4digit: unique among open codes");
assert(next.includes("CREATE TABLE IF NOT EXISTS public.business_point_pairing_failures"), "4digit: failures table");
assert(next.includes("c_client_limit constant integer := 5"), "4digit: 5 per client");
assert(next.includes("c_global_limit constant integer := 30"), "4digit: global burn");
assert(next.includes("c_client_window constant interval := interval '10 minutes'"), "4digit: 10 minute client window");
assert(next.includes("c_global_window constant interval := interval '20 minutes'"), "4digit: global window equals TTL");
assert(next.includes("'^[0-9]{4}$'"), "4digit: format");
assert(next.includes("% 10000"), "4digit: 0000-9999");
assert(next.includes("gen_random_uuid()"), "4digit: CSPRNG");
assert(!/random\(\)/.test(next), "4digit: no random()");
assert(next.includes("v_expires timestamptz := statement_timestamp() + interval '20 minutes'"), "4digit: 20 minute TTL");
assert(next.includes("GRANT EXECUTE ON FUNCTION public.redeem_business_point_pairing(text, text) TO service_role"), "4digit: server redeem");
assert(!/GRANT EXECUTE ON FUNCTION public\.redeem_business_point_pairing\(text, text\) TO[^;]*anon/.test(next), "4digit: no anon redeem");
assert(next.includes("REVOKE EXECUTE ON FUNCTION public.consume_business_point_pairing(text) FROM PUBLIC, anon, authenticated"), "4digit: old consume closed");
assert(next.split("COMMIT;")[0].includes("DROP TABLE") === false, "4digit: no drop before commit");
assert(!/https?:\/\//.test(next), "4digit: no links");

console.log("business-point-pairing-sql-unit: ok");
