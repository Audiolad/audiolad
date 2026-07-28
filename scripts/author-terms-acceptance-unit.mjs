#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHOR_TERMS_APPROVED_META,
  AUTHOR_TERMS_APPROVED_TEXT,
  AUTHOR_TERMS_TOC,
} from "../src/lib/author-terms/approved-content.ts";
import { buildAuthorTermsDocumentBlocks } from "../src/lib/author-terms/document-view.ts";
import { AUTHOR_TERMS_ACCEPTANCE_REQUIRED } from "../src/lib/author-terms/types.ts";
import { resolveAuthorCommercialCapabilities } from "../src/lib/authors/commercial-capabilities.ts";
import {
  DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
  evaluateCommercialOnboardingChecklist,
} from "../src/lib/author-dashboard/commercial-onboarding.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// 1) current edition published in code
assert.equal(AUTHOR_TERMS_TOC.length, 25);
assert.equal(AUTHOR_TERMS_APPROVED_META.version, "1.0");
assert.equal(AUTHOR_TERMS_APPROVED_META.versionId, "c0a7e001-7e12-4a01-9c01-81dfcb4acf97");
assert.equal(AUTHOR_TERMS_APPROVED_META.publishedAt, "2026-07-28T00:00:00+03:00");
assert.equal(AUTHOR_TERMS_APPROVED_META.effectiveAt, "2026-07-28T00:00:00+03:00");
assert.match(AUTHOR_TERMS_APPROVED_META.contentHash, /^[0-9a-f]{64}$/);
assert.equal(
  sha256(AUTHOR_TERMS_APPROVED_TEXT),
  AUTHOR_TERMS_APPROVED_META.contentHash,
);
assert.equal(
  AUTHOR_TERMS_APPROVED_META.contentHash,
  "22c32683c3b91781c1419d455e2a837c6d83999e9a2cf700cd8d330fda0fd5fc",
);
assert.equal(AUTHOR_TERMS_APPROVED_META.publicPath, "/author-terms");
assert.ok(!AUTHOR_TERMS_APPROVED_TEXT.includes("\u2014"), "em-dash forbidden");
assert.ok(AUTHOR_TERMS_APPROVED_TEXT.includes("\u2013"), "en-dash expected");
assert.ok(
  AUTHOR_TERMS_APPROVED_TEXT.includes(
    "Размер ответственности Платформы и Автора, а также порядок возмещения убытков",
  ),
);
assert.ok(
  AUTHOR_TERMS_APPROVED_TEXT.includes(
    "23.3. При недостижении согласия спор подлежит рассмотрению в суде в соответствии с законодательством Российской Федерации.",
  ),
);
for (const phrase of [
  "требуют отдельной юридической проработки",
  "не фиксируются как окончательные",
  "до утверждения финальной редакции",
  "подлежат уточнению в финальной редакции",
  "финальной редакции",
]) {
  assert.ok(
    !AUTHOR_TERMS_APPROVED_TEXT.includes(phrase),
    `forbidden phrase in text: ${phrase}`,
  );
}
assert.ok(!AUTHOR_TERMS_APPROVED_META.version.startsWith("sha256:"));

// document renders body once: intro + sections, without DOCX title/TOC duplicate
const blocks = buildAuthorTermsDocumentBlocks();
assert.ok(blocks.length > 20);
assert.ok(
  blocks.some(
    (b) =>
      b.type === "paragraph" &&
      b.text.includes("Настоящие Авторские условия сотрудничества"),
  ),
);
assert.equal(
  blocks.findIndex(
    (b) =>
      b.type === "paragraph" &&
      b.text.includes("Настоящие Авторские условия сотрудничества"),
  ),
  0,
  "body must start with intro paragraph after page TOC",
);
assert.ok(!blocks.some((b) => b.type === "heading" && b.text === "АУДИОЛАД"));
assert.ok(
  !blocks.some(
    (b) =>
      (b.type === "heading" || b.type === "paragraph") &&
      b.text === "Содержание",
  ),
);
assert.ok(
  !blocks.some(
    (b) =>
      b.type === "heading" &&
      b.text.startsWith("Авторские условия сотрудничества (оферта"),
  ),
);

const sectionHeadings = blocks.filter(
  (b) => b.type === "heading" && typeof b.id === "string" && b.id.startsWith("section-"),
);
assert.equal(sectionHeadings.length, 25);
for (let n = 1; n <= 25; n += 1) {
  const matches = sectionHeadings.filter((b) => b.id === `section-${n}`);
  assert.equal(matches.length, 1, `section-${n} must appear exactly once`);
}

const bodyText = blocks
  .map((b) => {
    if (b.type === "list") return b.items.join("\n");
    return b.text;
  })
  .join("\n");
assert.ok(bodyText.includes("1.1."));
// representative clauses across the document remain present
for (const clause of ["1.1.", "1.2.", "6.1.", "17.3.", "23.3."]) {
  assert.ok(bodyText.includes(clause), `missing clause marker ${clause}`);
}
// section 25 is operator requisites without 25.x numbering
assert.ok(bodyText.includes("25. Реквизиты оператора"));
assert.ok(bodyText.includes("ОГРНИП: 316505300063237"));
assert.ok(bodyText.includes("Конец документа"));
// full approved text (for hash) still contains front matter; render path strips it
assert.ok(AUTHOR_TERMS_APPROVED_TEXT.includes("Содержание"));
assert.ok(AUTHOR_TERMS_APPROVED_TEXT.startsWith("АУДИОЛАД"));

// migration seed matches code hash/id
const migration = readFileSync(
  path.join(
    root,
    "supabase/migrations/20260728140000_author_terms_acceptance.sql",
  ),
  "utf8",
);
assert.ok(migration.includes(AUTHOR_TERMS_APPROVED_META.versionId));
assert.ok(migration.includes(AUTHOR_TERMS_APPROVED_META.contentHash));
assert.ok(migration.includes(`'${AUTHOR_TERMS_APPROVED_META.version}'`));
assert.ok(migration.includes(AUTHOR_TERMS_APPROVED_META.publishedAt));
assert.ok(migration.includes(AUTHOR_TERMS_APPROVED_META.effectiveAt));
assert.ok(migration.includes("author_terms_versions_one_current_idx"));
assert.ok(!migration.includes("sha256:81dfcb4acf97"));
assert.ok(
  !migration.includes(
    "81dfcb4acf97f327dc37865bed6f12db82c1b13cd014b455ae9d3e9db6a5b608",
  ),
);

const page = readFileSync(
  path.join(root, "src/app/author-terms/page.tsx"),
  "utf8",
);
assert.ok(page.includes("Версия: {meta.version}"));
assert.ok(page.includes("Дата вступления в силу:"));
assert.ok(!page.includes("Редакция: {meta.version}"));

// capabilities: accept available for commercial_active when published
const caps = resolveAuthorCommercialCapabilities({
  accessStatus: "commercial_active",
  publishedTermsAvailable: true,
});
assert.equal(caps.can_accept_commercial_terms, true);
assert.equal(caps.can_create_paid_product, true);

// 2-5) checklist: without acceptance terms active, payout locked, paid locked
const pendingTerms = evaluateCommercialOnboardingChecklist({
  authorSlug: "demo",
  accessStatus: "commercial_onboarding",
  freeGateReady: true,
  products: [],
  campaigns: [],
  capabilities: {
    ...DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
    applicationSubmissionAvailable: true,
    payoutDetailsAvailable: true,
    termsAcceptanceAvailable: true,
  },
  applicationStatus: "approved",
  termsAccepted: false,
  payoutDetailsComplete: false,
  termsHref: "/author-dashboard/commercial/terms",
  payoutDetailsHref: "/author-dashboard/commercial/payout-details",
});

const stepIds = pendingTerms.steps.map((s) => s.id);
assert.deepEqual(stepIds.slice(0, 3), [
  "commercial_application",
  "terms_acceptance",
  "paid_product",
]);
assert.equal(stepIds.at(-1), "payout_details");
assert.equal(pendingTerms.steps[1].state, "active");
assert.equal(pendingTerms.steps[2].state, "locked");
assert.equal(pendingTerms.steps.at(-1)?.state, "locked");

const acceptedTerms = evaluateCommercialOnboardingChecklist({
  authorSlug: "demo",
  accessStatus: "commercial_active",
  freeGateReady: true,
  products: [],
  campaigns: [],
  capabilities: {
    ...DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
    applicationSubmissionAvailable: true,
    payoutDetailsAvailable: true,
    termsAcceptanceAvailable: true,
  },
  applicationStatus: "approved",
  termsAccepted: true,
  payoutDetailsComplete: false,
  payoutProfileStatus: null,
  legacyCommercialActive: false,
});
assert.equal(acceptedTerms.steps[1].state, "completed");
assert.equal(acceptedTerms.steps[2].id, "paid_product");
assert.equal(acceptedTerms.steps[2].state, "active");
assert.equal(acceptedTerms.steps.at(-1)?.id, "payout_details");
assert.equal(acceptedTerms.steps.at(-1)?.statusLabel, "Необязательно");
assert.equal(acceptedTerms.complete, false);
assert.equal(acceptedTerms.totalCount, 6);

// error code contract
assert.equal(AUTHOR_TERMS_ACCEPTANCE_REQUIRED, "AUTHOR_TERMS_ACCEPTANCE_REQUIRED");

// UI source contracts
const panel = readFileSync(
  path.join(
    root,
    "src/components/author-dashboard/AuthorTermsAcceptPanel.tsx",
  ),
  "utf8",
);
assert.ok(panel.includes("disabled={!checked || pending || success || !status.canAccept}"));
assert.ok(panel.includes("acknowledged: true"));
assert.ok(panel.includes("Условия приняты"));
assert.ok(panel.includes('variant?: "card" | "embedded"'));
assert.ok(panel.includes('variant = "card"'));
assert.ok(panel.includes("embedded"));

const legalPage = readFileSync(
  path.join(root, "src/app/author-dashboard/legal/page.tsx"),
  "utf8",
);
assert.ok(legalPage.includes("AuthorLegalTermsCard"));
assert.ok(!legalPage.includes("AuthorTermsAcceptPanel"));

const legalCard = readFileSync(
  path.join(
    root,
    "src/components/author-dashboard/AuthorLegalTermsCard.tsx",
  ),
  "utf8",
);
assert.ok(legalCard.includes('variant="embedded"'));
assert.equal(
  (
    legalCard.match(
      /Авторские условия сотрудничества платформы «АудиоЛад»/g,
    ) || []
  ).length,
  1,
);
assert.ok(legalCard.includes("Требуется принятие"));
assert.ok(legalCard.includes("Принято"));
assert.ok(legalCard.includes("Дата вступления в силу"));
assert.ok(legalCard.includes("Открыть документ"));
assert.ok(!legalCard.includes("Юридические документы"));
assert.equal((legalCard.match(/<section /g) || []).length, 1);

const unpublish = readFileSync(
  path.join(root, "src/app/api/author/products/[id]/unpublish/route.ts"),
  "utf8",
);
assert.ok(!unpublish.includes("assertAuthorCommercialWriteAllowed"));
assert.ok(!unpublish.includes("requireCurrentAuthorTermsAcceptance"));

const publish = readFileSync(
  path.join(root, "src/app/api/author/products/[id]/publish/route.ts"),
  "utf8",
);
assert.ok(publish.includes("assertAuthorCommercialWriteAllowed"));

const productPatch = readFileSync(
  path.join(root, "src/app/api/author/products/[id]/route.ts"),
  "utf8",
);
assert.ok(productPatch.includes("assertAuthorCommercialWriteAllowed"));

const payout = readFileSync(
  path.join(root, "src/app/api/author/payout-profile/route.ts"),
  "utf8",
);
assert.ok(payout.includes("requireCurrentAuthorTermsAcceptance"));

console.log("author-terms-acceptance-unit: ok");
