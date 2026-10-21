import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const file = "20270112120000_business_declared_rightsholder.sql";
const versions = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((f) => /^\d+.*\.sql$/.test(f));
const version = file.split("_")[0];
assert.equal(versions.filter((f) => f.startsWith(`${version}_`)).length, 1);
assert.ok(version > "20270111120000", "later than the draft-reuse migration");
const sql = read(`supabase/migrations/${file}`);
const clean = sql.replace(/--[^\n]*/g, "");
assert.match(clean, /^\s*BEGIN;/);
assert.match(clean, /COMMIT;\s*$/);
for (const [column, type] of [["name", "text"], ["type", "text"], ["is_self", "boolean"]]) {
  assert.match(clean, new RegExp(`ADD COLUMN IF NOT EXISTS declared_rightsholder_${column} ${type}`));
}
assert.match(clean, /CONSTRAINT business_declared_rightsholder_name_check CHECK \(\s+declared_rightsholder_name IS NULL OR \(\s+declared_rightsholder_name ~ '\[\^\[:space:\]\]'\s+AND length\(declared_rightsholder_name\) BETWEEN 1 AND 200\s+AND declared_rightsholder_name = regexp_replace\(declared_rightsholder_name, '\^\[\[:space:\]\]\+\|\[\[:space:\]\]\+\$', '', 'g'\)\s+\)/);
assert.doesNotMatch(clean, /\bbtrim\(\s*(?:p_name|declared_rightsholder_name)\s*\)/i, "ordinary-space-only trimming must not return");
assert.match(clean, /CONSTRAINT business_declared_rightsholder_type_check CHECK \(\s+declared_rightsholder_type IS NULL OR declared_rightsholder_type IN \('person', 'organization'\)/);
assert.match(clean, /CONSTRAINT business_declared_rightsholder_self_check CHECK \(\s+declared_rightsholder_is_self IS DISTINCT FROM true OR declared_rightsholder_type = 'person'/);
assert.match(clean, /CONSTRAINT business_declared_rightsholder_complete_check CHECK \(\s+\(declared_rightsholder_name IS NULL AND declared_rightsholder_type IS NULL AND declared_rightsholder_is_self IS NULL\)\s+OR\s+\(declared_rightsholder_name IS NOT NULL AND declared_rightsholder_type IS NOT NULL AND declared_rightsholder_is_self IS NOT NULL\)/);
const constraintBlocks = [...clean.matchAll(/DO \$\$\s+BEGIN\s+IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = '(business_declared_rightsholder_\w+_check)'\s+AND conrelid = 'public\.business_rightsholder_verifications'::regclass\) THEN\s+ALTER TABLE public\.business_rightsholder_verifications\s+ADD CONSTRAINT \1 CHECK \([\s\S]*?;\s+END IF;\s+END \$\$;/g)];
assert.deepEqual(constraintBlocks.map((block) => block[1]), [
  "business_declared_rightsholder_name_check",
  "business_declared_rightsholder_type_check",
  "business_declared_rightsholder_self_check",
  "business_declared_rightsholder_complete_check",
]);
assert.equal([...clean.matchAll(/\bADD CONSTRAINT\b/g)].length, constraintBlocks.length, "every constraint is guarded");
const functions = [...clean.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?\$\$;/g)];
assert.deepEqual(functions.map((f) => f[1]), ["author_business_verification_set_declared_rightsholder"]);
const fn = functions[0][0];
assert.match(fn, /p_verification_id uuid, p_is_self boolean, p_name text, p_type text/);
assert.match(fn, /RETURNS void\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public, pg_temp/);
assert.match(fn, /IF auth.uid\(\) IS NULL THEN\s+RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501'/);
assert.match(fn, /IF public.business_consent_caller_in_support_mode\(\) THEN\s+RAISE EXCEPTION 'support_mode_consent_forbidden' USING ERRCODE = '42501'/);
assert.match(fn, /WHERE id = p_verification_id AND owner_user_id = auth.uid\(\) FOR UPDATE;\s+IF NOT FOUND THEN\s+RAISE EXCEPTION 'business_verification_not_found'/);
assert.match(fn, /IF v_status IS DISTINCT FROM 'draft' THEN\s+RAISE EXCEPTION 'business_verification_transition_forbidden'/);
assert.match(fn, /DECLARE\s+v_status text;\s+v_name text;/);
assert.match(fn, /v_name := regexp_replace\(p_name, '\^\[\[:space:\]\]\+\|\[\[:space:\]\]\+\$', '', 'g'\);\s+IF p_name IS NULL OR v_name !~ '\[\^\[:space:\]\]' OR length\(v_name\) > 200 THEN\s+RAISE EXCEPTION 'business_declared_rightsholder_name_invalid'/);
assert.match(fn, /IF p_is_self IS NULL OR p_type IS NULL OR p_type NOT IN \('person', 'organization'\)\s+OR \(p_is_self AND p_type <> 'person'\) THEN\s+RAISE EXCEPTION 'business_declared_rightsholder_type_invalid'/);
assert.match(fn, /SET declared_rightsholder_name = v_name, declared_rightsholder_type = p_type,\s+declared_rightsholder_is_self = p_is_self, updated_at = clock_timestamp\(\)\s+WHERE id = p_verification_id/);
assert.ok(fn.indexOf("authentication_required") < fn.indexOf("FOR UPDATE"));
assert.ok(fn.indexOf("support_mode_consent_forbidden") < fn.indexOf("FOR UPDATE"));
const signature = "public.author_business_verification_set_declared_rightsholder(uuid,boolean,text,text)";
assert.ok(clean.includes(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, service_role;`));
assert.ok(clean.includes(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated;`));
assert.doesNotMatch(clean.replace(fn, ""), /\b(UPDATE|INSERT|DELETE|DROP|TRUNCATE)\b/i, "no backfill or destructive changes");
assert.doesNotMatch(clean, /provider_details|submit_v[23]|music_rightsholders/);
assert.doesNotMatch(sql, /\u2014/);
assert.ok(JSON.parse(read("package.json")).scripts["test:database-migrations"].includes("node scripts/business-declared-rightsholder-sql-unit.mjs"));
console.log("business-declared-rightsholder-sql-unit: static contract OK (SQL not applied)");
