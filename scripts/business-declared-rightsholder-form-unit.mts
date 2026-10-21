import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const form = read("src/components/author-dashboard/business/RightsholderVerificationForm.tsx");
const author = read("src/app/(platform)/author-dashboard/business/page.tsx");
const admin = read("src/app/(platform)/admin/business-verification/page.tsx");
const errors = read("src/lib/business-rightsholder/verification-errors.ts");
assert.match(form, /declaredRightsholder\?: \{ name: string; type: "person" \| "organization"; isSelf: boolean \} \| null/);
assert.match(form, /useState\(existing\?\.declaredRightsholder\?\.isSelf \?\? true\)/, "self by default, saved other remains other");
assert.match(form, /useState\(existing\?\.declaredRightsholder\?\.name \?\? ""\)/);
assert.match(form, /useState\(existing\?\.declaredRightsholder\?\.type \?\? ""\)/);
assert.match(form, /type="radio" name="declared-rightsholder" value="self"\s+checked=\{rightsholderIsSelf\}/);
assert.match(form, /type="radio" name="declared-rightsholder" value="other"\s+checked=\{!rightsholderIsSelf\}/);
for (const text of [
  "Правообладатель – я сам(а), физическое лицо",
  "Права принадлежат другому лицу (лейбл, соавтор)",
  "Ваши фамилия, имя и отчество", "Имя или название правообладателя", "Тип правообладателя",
  "Укажите настоящие ФИО, а не псевдоним или название проекта – на них оформляется подтверждение прав.",
]) assert.ok(form.includes(text), text);
assert.match(form, /required maxLength=\{200\} value=\{rightsholderName\}/);
assert.match(form, /onBlur=\{\(\) => setRightsholderName\(\(name\) => name.trim\(\)\)\}/);
assert.match(form, /!rightsholderName.trim\(\) \|\| Array.from\(rightsholderName.trim\(\)\).length > 200/);
assert.match(form, /!rightsholderIsSelf && rightsholderType !== "person" && rightsholderType !== "organization"/);
assert.match(form, /required value=\{rightsholderType\}/);
assert.match(form, /<option value="">Выберите тип<\/option>/);
assert.match(form, /<option value="person">Физлицо<\/option>/);
assert.match(form, /<option value="organization">Организация<\/option>/);
for (const field of ["rightsholderName", "rightsholderType"]) {
  assert.ok(form.includes(`errors.${field} ? <span className="mt-1 block text-red-600">{errors.${field}}</span>`));
}
const steps = [
  'supabase.rpc(unified ? "author_business_verification_draft_v3"',
  "if (draft.error) throw draft.error",
  'supabase.rpc("author_business_verification_set_declared_rightsholder"',
  "if (declared.error) throw declared.error",
  "for (const kind of evidenceKindsToUpload(values))",
  'supabase.rpc("author_business_evidence_reserve"',
  "supabase.storage.from(EVIDENCE_BUCKET).upload",
  'supabase.rpc("author_business_verification_submit_v3"',
  'supabase.rpc("author_business_verification_submit_v2"',
].map((text) => { const i = form.indexOf(text); assert.ok(i >= 0, text); return i; });
assert.deepEqual(steps, [...steps].sort((a, b) => a - b), "draft → declaration → uploads → submit for both modes");
assert.match(form, /p_verification_id: verificationId,\s+p_is_self: rightsholderIsSelf,\s+p_name: rightsholderName.trim\(\),\s+p_type: rightsholderIsSelf \? "person" : rightsholderType/);
assert.ok(form.indexOf("data-declared-rightsholder") < form.indexOf("{cfg.evidence.map("));
assert.match(form, /fieldset className="min-w-0 space-y-3" disabled=\{busy\}/);
for (const [code, text] of [
  ["name", "Укажите ФИО правообладателя (до 200 символов)"],
  ["type", "Выберите тип правообладателя"],
]) {
  assert.ok(form.includes(text));
  assert.ok(errors.includes(`business_declared_rightsholder_${code}_invalid: { text: "${text}" }`));
}
assert.match(errors, /business_verification_transition_forbidden: \{ text: PENDING_OR_CLOSED, refresh: true \}/);
assert.match(errors, /business_verification_not_found: \{ text: "[А-Я][^"]+", refresh: true \}/);
for (const source of [author, admin]) {
  assert.match(source, /\.select\("[^"\n]*declared_rightsholder_name, declared_rightsholder_type, declared_rightsholder_is_self/);
}
assert.match(author, /declaredRightsholder: verification.declared_rightsholder_name/);
assert.match(author, /isSelf: verification.declared_rightsholder_is_self/);
assert.match(admin, /declared: c.declared_rightsholder_name/);
assert.match(admin, /entityType: c.declared_rightsholder_type, isSelf: c.declared_rightsholder_is_self/);
for (const source of [form, author, admin, errors]) assert.doesNotMatch(source, /\u2014/);
const pkg = JSON.parse(read("package.json"));
assert.equal(pkg.scripts["test:business-declared-rightsholder-form"], "npx tsx scripts/business-declared-rightsholder-form-unit.mts");
assert.ok(pkg.scripts.test.includes("npm run test:business-declared-rightsholder-form"));
console.log("business-declared-rightsholder-form-unit: OK");
