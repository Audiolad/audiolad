import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveManualAdmission } from "../src/lib/business-admission/policy";

assert.deepEqual(resolveManualAdmission(null, null), { allowed: false, source: "unreviewed" });
assert.deepEqual(resolveManualAdmission({ allowed: true }, null), { allowed: true, source: "artist" });
assert.deepEqual(resolveManualAdmission({ allowed: true }, { allowed: false }), { allowed: false, source: "album" });
assert.deepEqual(resolveManualAdmission({ allowed: false }, { allowed: true }), { allowed: true, source: "album" });
assert.deepEqual(resolveManualAdmission({ allowed: true }, { allowed: null }), { allowed: true, source: "artist" });
assert.deepEqual(resolveManualAdmission({ allowed: null }, { allowed: null }), { allowed: false, source: "unreviewed" });
assert.deepEqual(resolveManualAdmission({ allowed: false }, { allowed: null }), { allowed: false, source: "artist" });
const migration = readFileSync(new URL("../supabase/migrations/20270131120000_business_manual_admissions.sql", import.meta.url), "utf8");
assert.match(migration, /'manual_content_gate', false/);
assert.match(migration, /IF NOT public\.business_manual_content_gate_enabled\(\) THEN/);
assert.match(migration, /resolve_business_track_eligibility_v1/);
assert.doesNotMatch(migration, /music_passport|music_analyzer_runs|business_space_admissions/);
console.log("Manual admission policy: PASS");
