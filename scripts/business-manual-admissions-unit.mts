import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterAgreementSubjects } from "../src/lib/business-admission/agreement-list";
import { resolveManualAdmission } from "../src/lib/business-admission/policy";

assert.deepEqual(resolveManualAdmission(null, null), { allowed: false, source: "unreviewed" });
assert.deepEqual(resolveManualAdmission({ allowed: true }, null), { allowed: true, source: "artist" });
assert.deepEqual(resolveManualAdmission({ allowed: true }, { allowed: false }), { allowed: false, source: "album" });
assert.deepEqual(resolveManualAdmission({ allowed: false }, { allowed: true }), { allowed: true, source: "album" });
assert.deepEqual(resolveManualAdmission({ allowed: true }, { allowed: null }), { allowed: true, source: "artist" });
assert.deepEqual(resolveManualAdmission({ allowed: null }, { allowed: null }), { allowed: false, source: "unreviewed" });
assert.deepEqual(resolveManualAdmission({ allowed: false }, { allowed: null }), { allowed: false, source: "artist" });
const listed = filterAgreementSubjects({
  kind: "album",
  artists: [{ id: "jazz", name: "Джаз Релакс" }, { id: "med", name: "Медитация" }],
  albums: [{ id: "a1", title: "Вечер", authorId: "jazz" }, { id: "a2", title: "Тишина", authorId: "med" }],
  acceptedAuthorIds: new Set(["jazz"]),
  query: "",
  direction: null,
  decision: null,
  directions: [{ key: "cafe" }],
  decisions: [{ author_id: "med", practice_id: null, direction_key: "cafe", allowed: true }],
  offset: 0,
  limit: 50,
});
assert.deepEqual(listed.rows.map((row) => row.id), ["a1"]);
assert.equal(listed.total, 1);
const migration = readFileSync(new URL("../supabase/migrations/20270131120000_business_manual_admissions.sql", import.meta.url), "utf8");
assert.match(migration, /'manual_content_gate', false/);
assert.match(migration, /IF NOT public\.business_manual_content_gate_enabled\(\) THEN/);
assert.match(migration, /resolve_business_track_eligibility_v1/);
assert.doesNotMatch(migration, /music_passport|music_analyzer_runs|business_space_admissions/);
const page = readFileSync(new URL("../src/app/(platform)/admin/business-admissions/page.tsx", import.meta.url), "utf8");
const action = readFileSync(new URL("../src/app/(platform)/admin/business-admissions/actions.ts", import.meta.url), "utf8");
assert.match(page, /author_has_business_agreement|listAgreementAdmissionPage/);
assert.match(page, /BUSINESS_AGREEMENT_LIST_HINT/);
assert.match(readFileSync(new URL("../src/lib/business-admission/agreement-list.ts", import.meta.url), "utf8"), /В списке только авторы, принявшие соглашение AudioLad Бизнес/);
assert.doesNotMatch(page, /—/);
assert.match(action, /admissionAuthorsAccepted/);
assert.doesNotMatch(action, /delete\(\)|DELETE FROM public\.business_content_admissions/i);
console.log("Manual admission policy: PASS");
