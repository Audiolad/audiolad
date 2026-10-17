#!/usr/bin/env node
// 8dcba9d1 PR 1: a staff member in support mode can never accept the author agreement
// or any AudioLad Business consent on the author's behalf (server + proxy + UI).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHOR_SUPPORT_CONSENT_PATH_PREFIXES,
  SUPPORT_MODE_ACCEPTANCE_FORBIDDEN,
  SUPPORT_MODE_CONSENT_NOTICE,
  isAuthorSupportConsentPath,
  isConsentBlockedForExecution,
} from "../src/lib/author-support/consent-guard.ts";
import { AUTHOR_SUPPORT_MUTATION_INVENTORY } from "../src/lib/author-support/mutation-inventory.ts";
import { isAuthorSupportBlockedMutation } from "../src/lib/author-support/policy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

// 1) Pure guard: fail-closed.
assert.equal(isConsentBlockedForExecution(null), true, "unknown context blocks");
assert.equal(isConsentBlockedForExecution({ isSupportMode: true, realUserId: A, actingUserId: B }), true);
assert.equal(isConsentBlockedForExecution({ isSupportMode: true, realUserId: A, actingUserId: A }), true);
assert.equal(isConsentBlockedForExecution({ isSupportMode: false, realUserId: A, actingUserId: B }), true, "mismatch blocks");
assert.equal(isConsentBlockedForExecution({ isSupportMode: false, realUserId: A, actingUserId: A }), false, "author's own click allowed");
assert.equal(SUPPORT_MODE_ACCEPTANCE_FORBIDDEN, "support_mode_acceptance_forbidden");
assert.match(SUPPORT_MODE_CONSENT_NOTICE, /только сам автор/);
assert.deepEqual([...AUTHOR_SUPPORT_CONSENT_PATH_PREFIXES], ["/api/author/terms/accept"]);

// 2) Proxy policy: with a support cookie the acceptance API is blocked (403 support_mutation_blocked).
for (const p of ["/api/author/terms/accept", "/api/author/terms/accept/", "/api/author/terms/accept?x=1"]) {
  assert.equal(isAuthorSupportConsentPath(p), true, p);
  assert.equal(isAuthorSupportBlockedMutation({ pathname: p, method: "POST" }), true, p);
}
for (const p of ["/api/author/terms", "/api/author/terms-accept", "/api/author/products/abc", "/api/author/onboarding"]) {
  assert.equal(isAuthorSupportBlockedMutation({ pathname: p, method: "POST" }), false, p);
}
const proxy = read("src/lib/supabase/proxy.ts");
assert.match(proxy, /supportCookie &&\s*isAuthorSupportBlockedMutation\(/);

// 3) Inventory: acceptance is a blocked support mutation, not "allowed_audited".
const terms = AUTHOR_SUPPORT_MUTATION_INVENTORY.find((i) => i.key === "author_terms");
assert.ok(terms);
assert.equal(terms.disposition, "blocked");
assert.deepEqual(terms.routePatterns, ["src/app/api/author/terms/accept/route.ts"]);

// 4) Route: never records under actingUserId; 403 in support mode before any write.
const route = read("src/app/api/author/terms/accept/route.ts");
assert.doesNotMatch(route, /actingUserId/, "route must not use the acting (author) user id");
assert.match(route, /isConsentBlockedForExecution\(execution\)/);
assert.match(route, /execution\?\.realUserId !== user\.id/);
assert.match(route, /\{ error: SUPPORT_MODE_ACCEPTANCE_FORBIDDEN \},\s*\{ status: 403/);
assert.match(route, /const acceptanceUserId = user\.id;/);
assert.ok(
  route.indexOf("SUPPORT_MODE_ACCEPTANCE_FORBIDDEN },") < route.indexOf("acceptCurrentAuthorTerms({"),
  "guard runs before the acceptance write",
);
assert.ok(
  route.indexOf("SUPPORT_MODE_ACCEPTANCE_FORBIDDEN },") < route.indexOf("authorHasAnyTermsAcceptance(authorId)"),
  "guard runs before any lookup",
);
assert.match(route, /supportMode: false,/);

// 5) Service: defence in depth + never offered in support mode.
const service = read("src/lib/author-terms/service.ts");
assert.match(service, /if \(input\.supportMode !== false\) \{\s*throw new AuthorTermsError\("support_mode_acceptance_forbidden", 403\);/);
assert.ok(
  service.indexOf('"support_mode_acceptance_forbidden", 403') < service.indexOf('.from("author_terms_acceptances")\n    .insert'),
  "service guard before insert",
);
assert.match(service, /canAccept:\s*!input\.supportMode &&/);
assert.match(service, /supportMode: input\.supportMode,/);
for (const rel of [
  "src/app/(platform)/author-dashboard/commercial/terms/page.tsx",
  "src/app/(platform)/author-dashboard/legal/page.tsx",
  "src/app/api/author/terms/route.ts",
]) {
  const src = read(rel);
  assert.match(src, /isConsentBlockedForExecution\(/, rel);
  assert.match(src, /supportMode/, rel);
}

// 6) UI: acceptance controls replaced by a notice; Business form not rendered in support mode.
const panel = read("src/components/author-dashboard/AuthorTermsAcceptPanel.tsx");
assert.match(panel, /status\.supportMode \? \(/);
assert.match(panel, /data-testid="support-mode-acceptance-blocked"/);
assert.match(panel, /\|\| status\.supportMode\) \{\s*return;/);
assert.ok(panel.indexOf("status.supportMode ? (") < panel.indexOf('type="checkbox"'), "notice replaces checkbox");
const business = read("src/app/(platform)/author-dashboard/business/page.tsx");
assert.match(business, /data-testid="support-mode-business-consent-blocked"/);
assert.ok(
  business.indexOf("if (supportMode) {") < business.indexOf("<RightsholderVerificationForm"),
  "form is not rendered in support mode",
);
assert.ok(business.indexOf("if (supportMode) {") < business.indexOf("const supabase = await createClient();"));
const form = read("src/components/author-dashboard/business/RightsholderVerificationForm.tsx");
assert.match(form, /support_mode_consent_forbidden/);
// No checkbox in the codebase is pre-ticked for these consents.
assert.match(form, /useState\(false\);\s*const \[confirmRights, setConfirmRights\] = useState\(false\);/);

// 7) DB guard exists for Business consents (scenarios: business-consents-support-mode-sql-unit.mjs).
const mig = read("supabase/migrations/20270105120000_business_consents_block_support_mode.sql");
assert.match(mig, /support_mode_consent_forbidden/);

console.log("author-support-consent-block-unit: ok");
