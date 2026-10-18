/**
 * 8d9cd0af (Sergey 18.10.2026 19:37): the rights-check form never shows a raw database code;
 * a red message that points to another page carries a direct link; en dashes only.
 * Plus the draft-reuse migration 20270111120000 contract (functions only, 'draft' editable again).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  LEGAL_DOCUMENTS_HREF,
  SIGN_IN_HREF,
  VERIFICATION_ERROR_CODES,
  VERIFICATION_ERROR_FALLBACK,
  verificationFormError,
} from "../src/lib/business-rightsholder/verification-errors";
import { SUPPORT_MODE_CONSENT_NOTICE } from "../src/lib/author-support/consent-guard";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

// 1. The reported case: PostgREST message with the code → friendly text, offers a refresh, no raw code.
const active = verificationFormError("business_verification_already_active");
assert.equal(active.text, "Заявка уже отправлена – дождитесь решения модератора.");
assert.equal(active.refresh, true);
assert.equal(verificationFormError('{"message":"business_verification_already_active"}').text, active.text);

// 2. Every mapped message: no raw code, no em dash, Russian text.
for (const code of VERIFICATION_ERROR_CODES) {
  const e = verificationFormError(code);
  assert.notEqual(e.text, VERIFICATION_ERROR_FALLBACK, code);
  assert.doesNotMatch(e.text, /[a-z]+_[a-z_]+/, `${code}: no raw code in text`);
  assert.doesNotMatch(e.text, /—/, `${code}: en dash only`);
  assert.match(e.text, /[А-Яа-яЁё]/, code);
  // Standing rule: a message that sends the author elsewhere links straight there.
  if (/раздел|войдите|страниц[еу] /i.test(e.text) && !e.refresh) assert.ok(e.link?.href, `${code}: direct link`);
}

// 3. Messages pointing to another page carry direct links.
const agreement = verificationFormError("business_unified_agreement_required");
assert.match(agreement.text, /«Юридические документы»/);
assert.deepEqual(agreement.link, { href: LEGAL_DOCUMENTS_HREF, label: "Перейти и принять" });
assert.equal(LEGAL_DOCUMENTS_HREF, "/author-dashboard/legal");
assert.equal(verificationFormError("authentication_required").link?.href, SIGN_IN_HREF);
assert.match(SIGN_IN_HREF, /^\/auth\/sign-in\?next=/);

// 4. Support mode keeps its notice; unknown / network errors fall back without leaking the message.
assert.equal(verificationFormError("support_mode_consent_forbidden").text, SUPPORT_MODE_CONSENT_NOTICE);
const unknown = verificationFormError("some_new_internal_code at line 3");
assert.equal(unknown.text, VERIFICATION_ERROR_FALLBACK);
assert.equal(unknown.link, undefined);
assert.equal(verificationFormError(undefined).text, VERIFICATION_ERROR_FALLBACK);
assert.equal(verificationFormError("Failed to fetch").text, VERIFICATION_ERROR_FALLBACK);
// Whole-token match: a longer code is not mistaken for a shorter one.
assert.equal(verificationFormError("business_track_not_in_product_x").text, VERIFICATION_ERROR_FALLBACK);

// 5. The form uses the mapper and never interpolates the raw message.
const form = read("src/components/author-dashboard/business/RightsholderVerificationForm.tsx");
assert.match(form, /verificationFormError\(message\)/);
assert.doesNotMatch(form, /Не получилось отправить: \$\{message\}/);
assert.doesNotMatch(form, /—/);
assert.match(form, /data-verification-form-error/);
assert.match(form, /<Link href=\{formError\.link\.href\}/);
assert.doesNotMatch(read("src/lib/business-rightsholder/verification-errors.ts"), /—/);

// 6. Migration 20270111120000: functions only; the owner's unsubmitted draft is editable again;
//    submitted / verified / restricted / revoked still refuse.
const mig = read("supabase/migrations/20270111120000_business_verification_draft_reuse.sql");
const clean = mig.replace(/--[^\n]*/g, "");
assert.match(clean, /^\s*BEGIN;/);
assert.match(clean, /COMMIT;\s*$/);
const outside = clean.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g, "");
assert.doesNotMatch(outside, /\b(ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|COMMENT)\b/i, "functions only");
const fns = [...clean.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
assert.deepEqual(fns, ["author_business_verification_draft", "author_business_verification_draft_v2", "author_business_verification_draft_v3"]);
for (const body of clean.matchAll(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g)) {
  assert.match(body[0], /SECURITY DEFINER/);
  assert.match(body[0], /SET search_path = public, pg_temp/);
  assert.match(body[0], /IF v_status NOT IN \('draft','rejected','needs_info'\) THEN/);
  assert.doesNotMatch(body[0], /NOT IN \([^)]*'(submitted|verified|restricted|revoked)'/);
}
const draft3 = clean.match(/FUNCTION public\.author_business_verification_draft_v3\([\s\S]*?\$\$;/)![0];
assert.match(draft3, /business_consent_caller_in_support_mode/);
assert.match(draft3, /business_unified_agreement_active\(\)/);
const rollback = read("docs/business/rightsholder-draft-reuse-8d9cd0af-rollback.sql");
assert.equal((rollback.match(/IF v_status NOT IN \('rejected','needs_info'\)/g) ?? []).length, 3);

console.log("business-verification-errors-unit: ok");
