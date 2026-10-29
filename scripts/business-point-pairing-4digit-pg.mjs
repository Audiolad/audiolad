#!/usr/bin/env node
/**
 * Isolated SQL test for 4-digit point pairing. Optional: runs only when
 * BUSINESS_POINT_PG_TEST_URL points at a throwaway postgres (never production).
 * Builds minimal stubs, the pairing part of 20270206120000, then 20270208120000.
 */
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.BUSINESS_POINT_PG_TEST_URL;
const container = process.env.AUDIOLAD_ONBOARDING_TEST_CONTAINER;
if (!url && !container) {
  console.log("business-point-pairing-4digit-pg: skipped (no BUSINESS_POINT_PG_TEST_URL or test container)");
  process.exit(0);
}
if (url && /supabase\.co|audiolad\.ru|timeweb/i.test(url)) throw new Error("refusing a non-isolated database");
const DB = "audiolad_point_pairing_test";

function command(sql, database) {
  const args = ["-v", "ON_ERROR_STOP=1", "-qtA", "-c", sql];
  if (container) return ["docker", ["exec", container, "psql", "-U", "postgres", "-d", database, ...args]];
  return ["psql", [url.replace(/\/[^/?]*(\?|$)/, `/${database}$1`), ...args]];
}

function run(sql, database) {
  const [bin, args] = command(sql, database);
  return execFileSync(bin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Same as run, but in parallel with other calls (separate psql sessions). */
async function runAsync(sql, database) {
  const [bin, args] = command(sql, database);
  return (await promisify(execFile)(bin, args, { encoding: "utf8" })).stdout.trim();
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = readFileSync(join(root, "supabase/migrations/20270206120000_business_point_pairing.sql"), "utf8");
const next = readFileSync(join(root, "supabase/migrations/20270208120000_business_point_pairing_4digit.sql"), "utf8");
// Tables, sha256 helper, create and consume from the base migration; the rest needs the full schema.
const cut = base.indexOf("CREATE OR REPLACE FUNCTION public.revoke_business_point_sessions");
const basePart = base.slice(0, cut).replace(/^BEGIN;/m, "") ;

const stubs = `
DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA auth;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE public.business_organizations (id uuid PRIMARY KEY);
CREATE TABLE public.business_locations (id uuid PRIMARY KEY, organization_id uuid, status text, name text);
CREATE TABLE public.business_zones (id uuid PRIMARY KEY, location_id uuid, status text, is_default boolean, created_at timestamptz DEFAULT now());
CREATE TABLE public.business_players (id uuid PRIMARY KEY, organization_id uuid, status text);
CREATE TABLE public.business_player_assignments (player_id uuid, zone_id uuid, unassigned_at timestamptz, assigned_at timestamptz DEFAULT now());
CREATE FUNCTION public.is_business_organization_owner(o uuid, u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.create_business_player(o uuid, n text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.assign_business_player_to_zone(p uuid, z uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-0000000000aa');
INSERT INTO public.business_organizations VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO public.business_locations
  SELECT ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000001', 'active', 'Кофейня ' || i
  FROM generate_series(1, 40) i;
INSERT INTO public.business_zones SELECT ('00000000-0000-0000-0002-' || lpad(i::text, 12, '0'))::uuid, ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, 'active', true FROM generate_series(1, 40) i;
INSERT INTO public.business_players SELECT ('00000000-0000-0000-0003-' || lpad(i::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000001', 'active' FROM generate_series(1, 40) i;
INSERT INTO public.business_player_assignments SELECT ('00000000-0000-0000-0003-' || lpad(i::text, 12, '0'))::uuid, ('00000000-0000-0000-0002-' || lpad(i::text, 12, '0'))::uuid, NULL FROM generate_series(1, 40) i;
`;

// A throwaway database of its own: the stubs drop and rebuild its public schema.
run(`DROP DATABASE IF EXISTS ${DB}`, "postgres");
run(`CREATE DATABASE ${DB}`, "postgres");
const psql = (sql) => run(sql, DB);
function check(cond, msg) {
  if (!cond) throw new Error(msg);
}
const loc = (i) => `00000000-0000-0000-0001-${String(i).padStart(12, "0")}`;
const asOwner = (sql) => psql(`SET test.uid = '00000000-0000-0000-0000-0000000000aa'; ${sql}`);
const create = (i) => JSON.parse(asOwner(`SELECT public.create_business_point_pairing('${loc(i)}')`));
const redeem = (code, ip) => JSON.parse(psql(`SELECT public.redeem_business_point_pairing('${code}', '${ip}')`));

try {
psql(stubs);
psql(basePart.replace(/COMMIT;\s*$/m, ""));
psql(next);

// Format: 4 digits, random.
const seen = new Set();
for (let i = 1; i <= 40; i += 1) {
  const out = create(i);
  check(out.ok === true && /^[0-9]{4}$/.test(out.code), `format ${out.code}`);
  seen.add(out.code);
}
check(seen.size === 40, "open codes are unique");
const ttl = Number(psql(`SELECT round(extract(epoch FROM expires_at - created_at)) FROM business_point_pairings WHERE location_id='${loc(1)}' ORDER BY created_at DESC LIMIT 1`));
check(ttl === 1200, `code TTL is 20 minutes, got ${ttl}`);
const sample = psql("SELECT string_agg(public.business_point_random_code(), ',') FROM generate_series(1, 2000)").split(",");
check(sample.every((c) => /^[0-9]{4}$/.test(c)), "random code format");
check(new Set(sample).size > 1500, "random codes spread");
check(sample.some((c) => c.startsWith("0")), "leading zeros kept");

// Only the newest code of a кофейня stays open.
const first = create(1).code;
const second = create(1).code;
check(Number(psql(`SELECT count(*) FROM business_point_pairings WHERE location_id='${loc(1)}' AND consumed_at IS NULL AND retired_at IS NULL`)) === 1, "one open per location");

// Two creates at once for one кофейня (double click, two tabs): still one open code.
const slowCreate = () => runAsync(`SET test.uid = '00000000-0000-0000-0000-0000000000aa'; BEGIN; SELECT public.create_business_point_pairing('${loc(8)}'); SELECT pg_sleep(0.7); COMMIT;`, DB);
await Promise.all([slowCreate(), slowCreate()]);
const openAfterRace = Number(psql(`SELECT count(*) FROM business_point_pairings WHERE location_id='${loc(8)}' AND consumed_at IS NULL AND retired_at IS NULL`));
check(openAfterRace === 1, `concurrent creates leave one open code, got ${openAfterRace}`);

// Collision retry: force the generator through a sequence that starts with an open code.
psql(`CREATE TABLE public.t_seq (n int); INSERT INTO public.t_seq VALUES (0);
CREATE OR REPLACE FUNCTION public.business_point_random_code() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v int; BEGIN UPDATE public.t_seq SET n = n + 1 RETURNING n INTO v;
RETURN CASE WHEN v <= 3 THEN '${second}' ELSE '4719' END; END $$;`);
psql(`DELETE FROM business_point_pairings WHERE code_hash = business_point_sha256('4719')`);
const retried = create(2);
check(retried.code === "4719", `collision retry got ${retried.code}`);
check(Number(psql("SELECT n FROM public.t_seq")) === 4, "retried three times");
// Exhausted retries raise.
psql(`CREATE OR REPLACE FUNCTION public.business_point_random_code() RETURNS text LANGUAGE sql AS $$ SELECT '${second}' $$;`);
let busy = false;
try { create(3); } catch { busy = true; }
check(busy, "code_space_busy after 25 tries");
// An expired open code is reusable.
psql(`UPDATE business_point_pairings SET expires_at = now() - interval '1 second' WHERE code_hash = business_point_sha256('${second}') AND consumed_at IS NULL AND retired_at IS NULL`);
check(create(3).code === second, "expired code reused");
const reused = second;

// Redemption: single use.
const ok = redeem(reused, "198.51.100.1");
check(ok.ok === true && /^[0-9a-f]{64}$/.test(ok.token) && ok.location_name === "Кофейня 3", "redeem ok");
const again = redeem(reused, "198.51.100.2");
check(again.ok === false && again.reason === "invalid_point_code", "single use");
check(redeem(first, "198.51.100.2").reason === "invalid_point_code", "replaced code is closed");
check(redeem("1d94cacba7", "198.51.100.2").reason === "invalid_point_code", "old long code rejected");

// Per-client limit: 5 wrong codes, then wait — even a right code is refused.
psql("TRUNCATE business_point_pairing_failures");
const good = create(5).code;
const wrong = good === "0000" ? "0001" : "0000";
for (let i = 0; i < 5; i += 1) {
  const r = redeem(wrong, "203.0.113.9");
  check(r.reason === "invalid_point_code" && r.attempts_left === 4 - i, `attempt ${i}`);
}
const locked = redeem(good, "203.0.113.9");
check(locked.reason === "too_many_attempts" && locked.retry_after > 0 && locked.retry_after <= 600, "client locked");
check(Number(psql("SELECT count(*) FROM business_point_pairing_failures")) === 5, "locked attempts are not counted again");
check(redeem(good, "203.0.113.10").ok === true, "other client still works");
psql("UPDATE business_point_pairing_failures SET created_at = created_at - interval '11 minutes'");
check(redeem(wrong, "203.0.113.9").reason === "invalid_point_code", "lock ends after the window");

// Global limit: 30 wrong codes worldwide burn all open codes.
psql("TRUNCATE business_point_pairing_failures");
const live = create(6).code;
const miss = live === "0000" ? "0001" : "0000";
for (let i = 0; i < 29; i += 1) redeem(miss, `192.0.2.${i}`);
// The global window is the code TTL: 15 minute old misses still count, 21 minute old do not.
psql("UPDATE business_point_pairing_failures SET created_at = created_at - interval '15 minutes'");
check(Number(psql("SELECT count(*) FROM business_point_pairings WHERE consumed_at IS NULL AND retired_at IS NULL AND expires_at > now()")) > 0, "open before burn");
redeem(miss, "192.0.2.200");
check(Number(psql("SELECT count(*) FROM business_point_pairings WHERE consumed_at IS NULL AND retired_at IS NULL")) === 0, "burned");
check(redeem(live, "192.0.2.201").reason === "invalid_point_code", "burned code refused");
psql("TRUNCATE business_point_pairing_failures");
const live2 = create(7).code;
const miss2 = live2 === "0000" ? "0001" : "0000";
for (let i = 0; i < 29; i += 1) redeem(miss2, `192.0.2.${i}`);
psql("UPDATE business_point_pairing_failures SET created_at = created_at - interval '21 minutes'");
redeem(miss2, "192.0.2.202");
check(redeem(live2, "192.0.2.203").ok === true, "old misses outside the window do not burn");

// Grants.
check(psql("SELECT has_function_privilege('anon', 'public.redeem_business_point_pairing(text, text)', 'EXECUTE')") === "f", "anon cannot redeem");
check(psql("SELECT has_function_privilege('anon', 'public.consume_business_point_pairing(text)', 'EXECUTE')") === "f", "anon cannot consume");
check(psql("SELECT has_function_privilege('service_role', 'public.redeem_business_point_pairing(text, text)', 'EXECUTE')") === "t", "server redeems");
check(psql("SELECT has_table_privilege('anon', 'public.business_point_pairing_failures', 'SELECT')") === "f", "failures hidden");

} finally {
  run(`DROP DATABASE IF EXISTS ${DB}`, "postgres");
}

console.log("business-point-pairing-4digit-pg: ok");
