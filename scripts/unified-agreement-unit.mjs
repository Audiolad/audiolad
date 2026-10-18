#!/usr/bin/env node
// 8dcba9d1 / 8d9cd0af PR 2: unified commercial agreement 2.0 — pure logic, text and wiring checks.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { buildAuthorTermsDocumentBlocks } from "../src/lib/author-terms/document-view.ts";
import {
  APPROVED_AUTHOR_TERMS_EDITIONS,
  LEGACY_AUTHOR_TERMS_EDITION,
  UNIFIED_AUTHOR_TERMS_EDITION,
  evaluateTermsGate,
  findAcceptableEditionByHash,
  findEditionByVersion,
} from "../src/lib/author-terms/editions.ts";
import { AUTHOR_TERMS_V2_META, AUTHOR_TERMS_V2_TEXT, AUTHOR_TERMS_V2_TOC } from "../src/lib/author-terms/approved-content-v2.ts";
import { isUnifiedAgreementEnabled } from "../src/lib/author-terms/unified-agreement-flag.ts";
import {
  AUTHOR_PRODUCT_STATUS_LABEL,
  mapAuthorAccessStatusToProductStatus,
} from "../src/lib/author-terms/unified-agreement-texts.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sha = (t) => createHash("sha256").update(t, "utf8").digest("hex");

// ---- Text 2.0: single source, hash-pinned, public requisites only.
assert.equal(AUTHOR_TERMS_V2_TEXT, read("docs/legal/author-agreement/edition-2.0.txt"), "code text = docs text");
assert.equal(sha(AUTHOR_TERMS_V2_TEXT), AUTHOR_TERMS_V2_META.contentHash);
for (const edition of APPROVED_AUTHOR_TERMS_EDITIONS) assert.equal(sha(edition.text), edition.contentHash, edition.version);
assert.equal(AUTHOR_TERMS_V2_META.version, "2.0");
assert.equal(AUTHOR_TERMS_V2_META.coversBusiness, true);
assert.match(AUTHOR_TERMS_V2_TEXT, /Петров Сергей Сергеевич, ИНН 507305817690, ОГРНИП 316505300063237/);
for (const forbidden of ["40802810", "Ставрополь", "Параллель", "БИК", "Корреспондентский", "+7 9", "Телефон", "паспорт"]) {
  assert.ok(!AUTHOR_TERMS_V2_TEXT.includes(forbidden), `no non-public requisites: ${forbidden}`);
}
assert.ok(!AUTHOR_TERMS_V2_TEXT.includes("—"), "en-dash only");
assert.ok(!AUTHOR_TERMS_V2_TEXT.includes("\uFFFD"), "no broken characters");
// Each clause on its own line: no line holds two numbered clauses.
for (const line of AUTHOR_TERMS_V2_TEXT.split("\n")) {
  assert.ok((line.match(/(^|\s)\d+\.\d+\.\s/g) ?? []).length <= 1, `one clause per line: ${line.slice(0, 60)}`);
}
// Key legal points of the owner's model (17.10).
for (const needle of [
  "два статуса: «Бесплатный» и «Коммерческий»",
  "отдельные согласия для «АудиоЛад Бизнес» и согласия по каждому альбому",
  "статьи 1238",
  "минимум один свой опубликованный трек",
  "не подтверждает права на остальные треки",
  "попадают в «АудиоЛад Бизнес» автоматически",
  "вступившего в силу судебного акта",
  "Фиксированных сумм возмещения нет",
  "статье 1326",
]) {
  assert.ok(AUTHOR_TERMS_V2_TEXT.includes(needle), `2.0 contains: ${needle}`);
}
assert.match(AUTHOR_TERMS_V2_TEXT, /режиме сопровождения/, "acceptance only by the author, never in support mode");
assert.match(AUTHOR_TERMS_V2_TEXT, /не принимается автоматически|автоматически не принимается|не считается принятой/, "no auto-acceptance on transition");
// Rendering: front matter stripped by the 2.0 marker, 29 sections = TOC.
const blocks = buildAuthorTermsDocumentBlocks(AUTHOR_TERMS_V2_TEXT, UNIFIED_AUTHOR_TERMS_EDITION.frontMatterMarker);
assert.equal(blocks[0].type, "paragraph");
assert.ok(blocks[0].text.startsWith("Настоящее Единое коммерческое соглашение"));
const headings = blocks.filter((b) => b.type === "heading");
assert.equal(headings.length, 29);
assert.deepEqual(headings.map((h) => h.id), AUTHOR_TERMS_V2_TOC.map((t) => t.id));
// Legacy rendering unchanged (default marker).
assert.ok(buildAuthorTermsDocumentBlocks()[0].text.startsWith("Настоящие Авторские условия сотрудничества"));

// ---- Flag & edition registry: flag off = only 1.2 acceptable.
assert.equal(isUnifiedAgreementEnabled({}), false);
assert.equal(isUnifiedAgreementEnabled({ AUDIOLAD_UNIFIED_AGREEMENT_ENABLED: "true" }), false, "only '1' enables");
assert.equal(isUnifiedAgreementEnabled({ AUDIOLAD_UNIFIED_AGREEMENT_ENABLED: "1" }), true);
assert.equal(findAcceptableEditionByHash(AUTHOR_TERMS_V2_META.contentHash, false), null, "flag off rejects 2.0");
assert.equal(findAcceptableEditionByHash(AUTHOR_TERMS_V2_META.contentHash, true), UNIFIED_AUTHOR_TERMS_EDITION);
assert.equal(findAcceptableEditionByHash(LEGACY_AUTHOR_TERMS_EDITION.contentHash, false), LEGACY_AUTHOR_TERMS_EDITION);
assert.equal(findAcceptableEditionByHash("0".repeat(64), true), null);
assert.equal(findEditionByVersion("1.2"), LEGACY_AUTHOR_TERMS_EDITION);
assert.equal(findEditionByVersion("9.9"), null);

// ---- Gate logic (no cut-off date, Business only via personal 2.0, never auto-accept).
const now = new Date("2026-11-01T00:00:00Z");
const farFuture = new Date("2099-01-01T00:00:00Z");
const cur = (over = {}) => ({ id: "v20", coversBusiness: true, ...over });
const on12 = [{ termsVersionId: "v12", coversBusiness: false, keepsCommercialAccess: true }];
const on11 = [{ termsVersionId: "v11", coversBusiness: false, keepsCommercialAccess: false }];
const on20 = [{ termsVersionId: "v12", coversBusiness: false, keepsCommercialAccess: true }, { termsVersionId: "v20", coversBusiness: true, keepsCommercialAccess: false }];
const NONE = { accepted: false, acceptedCurrent: false, previousEditionActive: false, reacceptInvited: false, businessAgreement: false };
// Flag off: exactly the old rule.
assert.deepEqual(evaluateTermsGate({ unifiedEnabled: false, now, current: cur(), acceptances: on12 }), NONE);
assert.equal(evaluateTermsGate({ unifiedEnabled: false, now, current: { id: "v12", coversBusiness: false }, acceptances: on12 }).accepted, true);
// Flag on, 1.2 author: commercial yes (indefinitely), Business no, invitation notice yes.
let g = evaluateTermsGate({ unifiedEnabled: true, now, current: cur(), acceptances: on12 });
assert.deepEqual(g, { accepted: true, acceptedCurrent: false, previousEditionActive: true, reacceptInvited: true, businessAgreement: false });
// No cut-off: same result at any moment in the future.
assert.deepEqual(evaluateTermsGate({ unifiedEnabled: true, now: farFuture, current: cur(), acceptances: on12 }), g);
// 1.1-only author (edition not flagged): unchanged strict rule, notice shown, no Business.
g = evaluateTermsGate({ unifiedEnabled: true, now, current: cur(), acceptances: on11 });
assert.equal(g.accepted, false); assert.equal(g.previousEditionActive, false); assert.equal(g.reacceptInvited, true); assert.equal(g.businessAgreement, false);
// Accepted 2.0 → everything, no notice.
assert.deepEqual(evaluateTermsGate({ unifiedEnabled: true, now, current: cur(), acceptances: on20 }),
  { accepted: true, acceptedCurrent: true, previousEditionActive: false, reacceptInvited: false, businessAgreement: true });
// New author with no acceptances: nothing, no notice (first acceptance flow).
assert.deepEqual(evaluateTermsGate({ unifiedEnabled: true, now, current: cur(), acceptances: [] }), NONE);
// Later edition 2.1: Business keeps only if 2.0 is explicitly flagged to continue; otherwise personal 2.1 needed.
assert.equal(evaluateTermsGate({ unifiedEnabled: true, now, current: cur({ id: "v21" }), acceptances: on20 }).businessAgreement, false);
assert.equal(evaluateTermsGate({ unifiedEnabled: true, now, current: cur({ id: "v21" }),
  acceptances: [{ termsVersionId: "v20", coversBusiness: true, keepsCommercialAccess: true }] }).businessAgreement, true);
assert.equal(evaluateTermsGate({ unifiedEnabled: true, now, current: null, acceptances: on20 }).accepted, false);
// Source contract: no grace/cut-off anywhere in the gate code, banner shows no end date.
for (const f of ["src/lib/author-terms/editions.ts", "src/lib/author-terms/service.ts", "src/lib/studio-music/catalog.ts",
  "src/components/author-dashboard/AuthorAgreementReacceptBanner.tsx", "src/lib/author-terms/types.ts"]) {
  assert.doesNotMatch(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), /reaccept_grace_until|graceUntil|inGrace/, `${f}: no grace`);
}

// ---- Cabinet notices: a 1.2 author after the switch sees an invitation, never a "must accept / blocked" warning.
{
  const { resolveAuthorTermsNotice } = await import("../src/lib/author-terms/terms-notice.ts");
  const v = { id: "v20", version: "2.0" };
  assert.equal(resolveAuthorTermsNotice({ currentVersion: v, acceptedCurrent: false, previousEditionActive: true, reacceptInvited: true }), "invite");
  assert.equal(resolveAuthorTermsNotice({ currentVersion: v, acceptedCurrent: false, previousEditionActive: true, reacceptInvited: false }), "none");
  assert.equal(resolveAuthorTermsNotice({ currentVersion: v, acceptedCurrent: true, previousEditionActive: false, reacceptInvited: false }), "none");
  // 1.1-only author / new author / flag off: unchanged "required" warning.
  assert.equal(resolveAuthorTermsNotice({ currentVersion: v, acceptedCurrent: false, previousEditionActive: false, reacceptInvited: true }), "required");
  assert.equal(resolveAuthorTermsNotice({ currentVersion: v, acceptedCurrent: false }), "required");
  assert.equal(resolveAuthorTermsNotice(null), "none");
  // End-to-end status → notice for the main dashboard scenario (gate output wired as service.ts does).
  const gate = evaluateTermsGate({ unifiedEnabled: true, now, current: cur(), acceptances: on12 });
  assert.equal(resolveAuthorTermsNotice({ currentVersion: v, acceptedCurrent: gate.acceptedCurrent,
    previousEditionActive: gate.previousEditionActive, reacceptInvited: gate.reacceptInvited }), "invite");
  const banner = read("src/components/author-dashboard/AuthorTermsRequiredBanner.tsx");
  assert.match(banner, /resolveAuthorTermsNotice\(status\)/);
  assert.ok(banner.indexOf('notice === "invite"') < banner.indexOf("Нужно принять Авторские условия сотрудничества"), "invite branch before the warning");
  assert.match(read("src/components/author-dashboard/AuthorLegalTermsCard.tsx"), /status\.previousEditionActive\s*\?\s*PREVIOUS_EDITION_ACTIVE_STATUS_LABEL/);
  assert.match(read("src/app/(platform)/author-dashboard/commercial/terms/page.tsx"), /status\.previousEditionActive \? \(\s*<AuthorAgreementReacceptBanner/);
}

// ---- Two public statuses.
assert.deepEqual(Object.values(AUTHOR_PRODUCT_STATUS_LABEL), ["Бесплатный", "Коммерческий"]);
for (const [s, want] of [["free", "free"], ["commercial_pending", "free"], ["commercial_onboarding", "commercial"],
  ["commercial_active", "commercial"], ["commercial_suspended", "commercial"], [null, "free"], ["suspended", "free"]]) {
  assert.equal(mapAuthorAccessStatusToProductStatus(s), want, String(s));
}

// ---- Wiring (source-level).
const service = read("src/lib/author-terms/service.ts");
assert.match(service, /\.select\(isUnifiedAgreementEnabled\(\) \? UNIFIED_VERSION_COLUMNS : VERSION_COLUMNS\)/, "new columns only with flag on");
assert.match(service, /const unifiedEnabled = isUnifiedAgreementEnabled\(\);/);
assert.match(service, /findAcceptableEditionByHash\(\s*currentVersion\.content_hash,\s*unifiedEnabled,\s*\)/);
assert.match(service, /if \(input\.supportMode !== false\)/, "PR 1 guard kept");
const form = read("src/components/author-dashboard/business/RightsholderVerificationForm.tsx");
assert.match(form, /useState\(false\);\n  const \[confirmRights, setConfirmRights\] = useState\(false\)/, "legacy boxes not pre-ticked");
assert.match(form, /unified\s*\? await supabase\.rpc\("author_business_verification_submit_v3"/);
assert.match(form, /\{unified \? \(\n\s*<p[^>]*data-testid="unified-agreement-covers-business"/, "unified mode renders no checkboxes");
const panel = read("src/components/author-dashboard/AuthorTermsAcceptPanel.tsx");
assert.match(panel, /const \[checked, setChecked\] = useState\(false\);/, "single acceptance checkbox, not pre-ticked");
assert.equal((panel.match(/type="checkbox"/g) ?? []).length, 1, "exactly one checkbox");
const businessPage = read("src/app/(platform)/author-dashboard/business/page.tsx");
assert.match(businessPage, /const unified = isUnifiedAgreementEnabled\(\);/);
assert.match(businessPage, /unifiedView && unifiedView\.status\.businessAgreement !== true \? null/, "no form before the agreement");
assert.ok(businessPage.indexOf("support-mode-business-consent-blocked") < businessPage.indexOf("isUnifiedAgreementEnabled()"), "support-mode early return precedes everything");
assert.doesNotMatch(read("src/components/author-dashboard/business/BusinessAgreementStatusScreen.tsx"), /type="checkbox"|author_business_product_optin/);
assert.doesNotMatch(read("src/app/(platform)/author-dashboard/business/page.tsx"), /author_business_product_optin/);
assert.match(read("src/app/(platform)/business-documents/music-rights-declaration/page.tsx"), /archived=\{archived\}/);
assert.match(read("src/lib/business-rightsholder/program-documents.ts"), /ARCHIVED_WITH_UNIFIED_AGREEMENT: readonly ProgramDocumentKey\[\] = \["business_music_rights_declaration"\]/);
// Acceptance is bound to the edition the author saw (Codex PR2 r1 B1).
const svc = read("src/lib/author-terms/service.ts");
assert.match(svc, /expectedTermsVersionId !== currentVersion\.id/);
assert.match(svc, /expectedContentHash !== currentVersion\.content_hash/);
assert.match(svc, /unifiedEnabled && !bindingProvided/, "flag on: binding mandatory");
assert.match(svc, /AuthorTermsError\("terms_version_changed", 409\)/);
const acceptRoute = read("src/app/api/author/terms/accept/route.ts");
assert.match(acceptRoute, /expectedTermsVersionId: optionalString\(body\.terms_version_id, 64\)/);
assert.match(acceptRoute, /expectedContentHash: optionalString\(body\.content_hash, 64\)/);
const acceptPanel = panel;
assert.match(acceptPanel, /terms_version_id: version\?\.id/);
assert.match(acceptPanel, /content_hash: version\?\.contentHash/);
assert.match(acceptPanel, /terms_version_changed/);
// "В Бизнесе" requires both layers live and currently valid.
assert.match(businessPage, /tracksLiveInBusiness\(/);
assert.match(businessPage, /valid_until/);
{
  const { tracksLiveInBusiness } = await import("../src/lib/business-rightsholder/track-in-business.ts");
  const now = new Date("2026-10-17T00:00:00Z");
  const rows = [
    { audio_item_id: "t1", rights_layer: "recording", valid_from: "2026-10-01", valid_until: null },
    { audio_item_id: "t1", rights_layer: "composition", valid_from: "2026-10-01", valid_until: null },
    { audio_item_id: "t2", rights_layer: "recording", valid_from: "2026-10-01", valid_until: null },
    { audio_item_id: "t3", rights_layer: "recording", valid_from: "2026-10-01", valid_until: null },
    { audio_item_id: "t3", rights_layer: "composition", valid_from: "2026-10-01", valid_until: "2026-10-10" },
    { audio_item_id: "t4", rights_layer: "recording", valid_from: "2026-11-01", valid_until: null },
    { audio_item_id: "t4", rights_layer: "composition", valid_from: "2026-10-01", valid_until: null },
  ];
  assert.deepEqual([...tracksLiveInBusiness(rows, now)], ["t1"], "only both live, currently valid layers count");
}
// Program terms п. 1 (r7): sublicensing basis = unified agreement 2.0, not the rights statement; r6 frozen for flag OFF.
{
  const r7 = read("docs/business/public/program-terms.md");
  const r6 = read("docs/business/public/archive/program-terms-r6-2026-10-17.md");
  const item1 = (t) => t.split("\n").find((l) => l.startsWith("1. "));
  assert.equal(sha(r6), "493c0dd893b2646115b98997727e47ae7df1c3aa94c8d576605a96bf940c7dff", "r6 archive byte-identical to merged #888");
  assert.doesNotMatch(item1(r7), /Заявлени/, "r7 п. 1 no longer names the rights statement");
  assert.match(item1(r7), /Единое коммерческое соглашение с правообладателем/);
  assert.match(item1(r7), /редакция 2\.0, разделы 7 и 8/);
  assert.match(item1(r6), /Заявление правообладателя о правах на музыку/);
  assert.equal(r7.split("\n").filter((l, i) => l !== r6.split("\n")[i]).length, 1, "only п. 1 changed");
  const { programTermsDocument } = await import("../src/lib/business-rightsholder/program-documents.ts");
  const { clientDocumentSource } = await import("../src/lib/business-app/client-document-content.ts");
  assert.equal(programTermsDocument(true).markdown, r7);
  assert.equal(programTermsDocument(true).sha256, sha(r7));
  assert.equal(programTermsDocument(false).markdown, r6, "flag off: legacy consent flow keeps r6");
  assert.equal(programTermsDocument(false).version, "r6-2026-10-17");
  assert.equal(clientDocumentSource("b2b-terms", true).markdown, r7);
  assert.equal(clientDocumentSource("b2b-terms", false).markdown, r6);
  assert.equal(clientDocumentSource("venue-license", false), clientDocumentSource("venue-license", true));
}
// Unified form never uses the whole-album legacy draft.
assert.match(read("src/components/author-dashboard/business/RightsholderVerificationForm.tsx"), /unified \? "author_business_verification_draft_v3" : "author_business_verification_draft_v2"/);
{
  const { clientDocumentSource } = await import("../src/lib/business-app/client-document-content.ts");
  assert.equal(clientDocumentSource("b2b-terms", true).version, "r7-2026-10-17");
  assert.equal(clientDocumentSource("b2b-terms", false).version, undefined);
  assert.match(read("src/app/business-app/documents/[id]/page.tsx"), /data-document-version=\{source\.version \?\? doc\.version\}/);
}
// Venue documents are r6's: untouched here.
const plan = read("docs/business/unified-agreement-8dcba9d1/ROLLOUT-PLAN-RU.md");
for (const needle of ["Резервная копия", "Пробное восстановление", "20270109120000", "AUDIOLAD_UNIFIED_AGREEMENT_ENABLED", "01-insert-edition-2.0.sql", "02-switch-current.sql", "Откат"]) {
  assert.ok(plan.includes(needle), `rollout plan mentions ${needle}`);
}
assert.ok(read("docs/business/unified-agreement-8dcba9d1/TEST-PLAN-RU.md").includes("Aurafon"));
console.log("unified-agreement-unit: ok");
