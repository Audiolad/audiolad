#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHOR_COMMERCIAL_SHARE_BPS,
  DEFAULT_COMMERCIAL_SHARE,
  PLATFORM_COMMERCIAL_SHARE_BPS,
  assertCommercialShareBpsPair,
} from "../src/lib/author-commercial/economics.ts";
import {
  DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
  evaluateCommercialOnboardingChecklist,
  resolveCommercialApplicationStatus,
} from "../src/lib/author-dashboard/commercial-onboarding.ts";
import {
  authorAccessAllowsPaidProducts,
  getPaidPricingDisabledReason,
  isAuthorCommercialApprovedAccess,
} from "../src/lib/authors/access.ts";
import { resolveAuthorCommercialCapabilities } from "../src/lib/authors/commercial-capabilities.ts";
import {
  COMMERCIAL_APPLICATION_APPROVED_MESSAGE_TYPE,
  buildCommercialApplicationApprovedDedupKey,
} from "../src/lib/email/operational-deliveries.ts";
import {
  COMMERCIAL_APPLICATION_APPROVED_EMAIL_SUBJECT,
  getCommercialOnboardingUrl,
  renderCommercialApplicationApprovedEmailHtml,
  renderCommercialApplicationApprovedEmailText,
} from "../src/lib/email/templates/commercial-application-approved.ts";
import { brandEmailTemplateRenderer } from "../src/lib/email/templates/renderer.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function evaluate(overrides = {}) {
  return evaluateCommercialOnboardingChecklist({
    authorSlug: "demo-author",
    accessStatus: "free",
    freeGateReady: true,
    products: [],
    campaigns: [],
    capabilities: DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
    ...overrides,
  });
}

function testAccessModel() {
  assert.equal(authorAccessAllowsPaidProducts("commercial_active"), true);
  assert.equal(authorAccessAllowsPaidProducts("commercial"), true);
  assert.equal(authorAccessAllowsPaidProducts("commercial_onboarding"), false);
  assert.equal(authorAccessAllowsPaidProducts("commercial_suspended"), false);
  assert.equal(authorAccessAllowsPaidProducts("commercial_pending"), false);

  assert.equal(isAuthorCommercialApprovedAccess("commercial_onboarding"), true);
  assert.equal(isAuthorCommercialApprovedAccess("commercial_pending"), false);

  assert.match(
    getPaidPricingDisabledReason("commercial_onboarding") ?? "",
    /условия сотрудничества/,
  );
  assert.doesNotMatch(
    getPaidPricingDisabledReason("commercial_onboarding") ?? "",
    /данные для выплат|реквизит/i,
  );

  const onboardingCaps = resolveAuthorCommercialCapabilities({
    accessStatus: "commercial_onboarding",
    publishedTermsAvailable: false,
  });
  assert.equal(onboardingCaps.can_access_commercial_onboarding, true);
  assert.equal(onboardingCaps.can_edit_payout_profile, true);
  assert.equal(onboardingCaps.can_view_commercial_terms, true);
  assert.equal(onboardingCaps.can_accept_commercial_terms, false);
  assert.equal(onboardingCaps.can_create_paid_product, false);
  assert.equal(onboardingCaps.can_publish_paid_product, false);

  const activeCaps = resolveAuthorCommercialCapabilities({
    accessStatus: "commercial_active",
  });
  assert.equal(activeCaps.can_create_paid_product, true);
  assert.equal(activeCaps.can_publish_paid_product, true);
}

function testOnboardingStates() {
  const pending = evaluate({
    accessStatus: "commercial_pending",
    applicationStatus: "in_review",
  });
  assert.equal(pending.steps[1].state, "locked");
  assert.equal(pending.steps[2].state, "locked");
  assert.equal(pending.steps[3].state, "locked");

  const approved = evaluate({
    accessStatus: "commercial_onboarding",
    applicationStatus: "approved",
    capabilities: {
      ...DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
      payoutDetailsAvailable: true,
      termsAcceptanceAvailable: true,
    },
    payoutDetailsHref: "/author-dashboard/commercial/payout-details?author=demo",
    termsHref: "/author-dashboard/commercial/terms?author=demo",
  });
  assert.equal(approved.steps[0].state, "completed");
  assert.equal(approved.steps[1].id, "terms_acceptance");
  assert.equal(approved.steps[1].state, "active");
  assert.equal(approved.steps[2].id, "paid_product");
  assert.equal(approved.steps[2].state, "locked");
  assert.equal(approved.steps.at(-1)?.id, "payout_details");
  assert.equal(approved.steps.at(-1)?.state, "locked");
  assert.match(approved.steps[1].href ?? "", /\/terms/);
  assert.equal(approved.steps[1].actionLabel, "Открыть условия");
  assert.match(
    approved.steps[2].hint ?? "",
    /Сначала примите Авторские условия сотрудничества/,
  );
  assert.match(
    approved.steps.at(-1)?.hint ?? "",
    /Сначала примите Авторские условия сотрудничества/,
  );

  const afterTerms = evaluate({
    accessStatus: "commercial_active",
    applicationStatus: "approved",
    capabilities: {
      ...DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
      payoutDetailsAvailable: true,
      termsAcceptanceAvailable: true,
    },
    termsAccepted: true,
    payoutDetailsHref: "/author-dashboard/commercial/payout-details?author=demo",
    termsHref: "/author-dashboard/commercial/terms?author=demo",
  });
  assert.equal(afterTerms.steps[1].state, "completed");
  assert.equal(afterTerms.steps[2].id, "paid_product");
  assert.equal(afterTerms.steps[2].state, "active");
  assert.equal(afterTerms.steps.at(-1)?.id, "payout_details");
  assert.equal(afterTerms.steps.at(-1)?.state, "active");
  assert.equal(afterTerms.steps.at(-1)?.statusLabel, "Не заполнено");
  assert.match(
    afterTerms.steps.at(-1)?.hint ?? "",
    /Можно заполнить позже/,
  );
  assert.equal(afterTerms.complete, false);
  assert.equal(afterTerms.totalCount, 6);

  const rejected = evaluate({
    accessStatus: "free",
    applicationStatus: "rejected",
  });
  assert.equal(rejected.steps[1].state, "locked");
  assert.equal(rejected.steps[2].state, "locked");

  assert.equal(
    resolveCommercialApplicationStatus({
      accessStatus: "commercial_onboarding",
    }),
    "approved",
  );
}

function testEconomics() {
  assert.equal(AUTHOR_COMMERCIAL_SHARE_BPS, 7000);
  assert.equal(PLATFORM_COMMERCIAL_SHARE_BPS, 3000);
  assert.equal(DEFAULT_COMMERCIAL_SHARE.platformFeeBps, 3000);
  assert.equal(
    assertCommercialShareBpsPair(
      AUTHOR_COMMERCIAL_SHARE_BPS,
      PLATFORM_COMMERCIAL_SHARE_BPS,
    ),
    true,
  );
}

async function testApprovalEmail() {
  assert.equal(
    COMMERCIAL_APPLICATION_APPROVED_EMAIL_SUBJECT,
    "Коммерческий кабинет АудиоЛада одобрен",
  );
  assert.equal(
    getCommercialOnboardingUrl("https://audiolad.ru"),
    "https://audiolad.ru/author-dashboard",
  );
  assert.equal(
    buildCommercialApplicationApprovedDedupKey("app-1"),
    "commercial_application_approved:app-1",
  );
  assert.equal(
    COMMERCIAL_APPLICATION_APPROVED_MESSAGE_TYPE,
    "commercial_application_approved",
  );

  const html = renderCommercialApplicationApprovedEmailHtml({
    authorName: "Герман",
    siteOrigin: "https://audiolad.ru",
  });
  const text = renderCommercialApplicationApprovedEmailText({
    authorName: "Герман",
    siteOrigin: "https://audiolad.ru",
  });
  assert.match(html, /Здравствуйте, Герман!/);
  assert.match(html, /Продолжить подключение/);
  assert.match(html, /https:\/\/audiolad\.ru\/author-dashboard/);
  assert.match(text, /данные для получения авторского вознаграждения/);

  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: "commercial_application_approved",
    templateVersion: "commercial-application-approved-v1-20260727",
    payload: {
      authorName: "Герман",
      siteOrigin: "https://audiolad.ru",
    },
  });
  assert.equal(rendered.ok, true);
  if (rendered.ok) {
    assert.equal(
      rendered.subject,
      COMMERCIAL_APPLICATION_APPROVED_EMAIL_SUBJECT,
    );
  }
}

function testSourceGuards() {
  const migration = read(
    "supabase/migrations/20260727180000_commercial_onboarding_access_statuses.sql",
  );
  assert.match(migration, /commercial_onboarding/);
  assert.match(migration, /commercial_active/);
  assert.match(migration, /commercial_suspended/);
  assert.match(migration, /migration_commercial_to_commercial_active/);
  assert.match(migration, /commercial_access_status_backfill_incomplete/);
  assert.match(migration, /author_access_allows_paid_products/);
  assert.match(
    migration,
    /set_author_access_status_for_commercial_application/,
  );
  assert.match(migration, /'commercial_onboarding'/);

  const approveFn = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.approve_author_commercial_application"),
  );
  assert.match(approveFn, /idempotent',\s*true/);
  assert.match(approveFn, /'commercial_onboarding'/);
  assert.doesNotMatch(
    approveFn.slice(0, 2500),
    /set_author_access_status_for_commercial_application\(\s*v_row\.author_id,\s*'commercial'/,
  );

  const actions = read("src/app/admin/commercial-applications/actions.ts");
  assert.match(actions, /sendCommercialApplicationApprovedEmail/);
  assert.match(actions, /!rpc\.result\.idempotent/);
  assert.match(actions, /commercial_application_approved_email_failed/);

  const operational = read("src/lib/email/operational-deliveries.ts");
  assert.match(
    operational,
    /messageType === COMMERCIAL_APPLICATION_APPROVED_MESSAGE_TYPE/,
  );
  assert.match(operational, /\? null\s*:\s*applicationId/);
  assert.match(
    operational,
    /operational_email_deliveries\.application_id FK points only at/,
  );

  const payoutPage = read(
    "src/app/author-dashboard/commercial/payout-details/page.tsx",
  );
  const termsPage = read(
    "src/app/author-dashboard/commercial/terms/page.tsx",
  );
  assert.match(payoutPage, /requireCommercialOnboardingAuthor/);
  assert.match(payoutPage, /AuthorPayoutProfileForm/);
  assert.match(termsPage, /requireCommercialOnboardingAuthor/);
  assert.match(termsPage, /AuthorTermsAcceptPanel/);
  assert.match(termsPage, /Условия приняты/);

  const loader = read("src/lib/author-dashboard/load-onboarding-state.ts");
  assert.match(loader, /payoutDetailsAvailable: commercialOnboardingOpen/);
  assert.match(loader, /hasAcceptedCurrentAuthorTerms/);
  assert.match(loader, /termsAccepted: termsAcceptance\.accepted/);
  assert.match(loader, /payout-details/);
  assert.match(loader, /\/terms/);

  // Existing alerts / become-author approval wiring remain.
  assert.match(
    read("src/lib/email/send-commercial-application-admin-alert-email.ts"),
    /sendCommercialApplicationAdminAlertEmail/,
  );
  assert.match(
    read("src/app/admin/author-applications/actions.ts"),
    /sendAuthorApplicationApprovedEmail/,
  );
  assert.match(
    read("src/lib/email/send-author-application-approved-email.ts"),
    /AUTHOR_APPLICATION_APPROVED_MESSAGE_TYPE/,
  );
}

async function main() {
  testAccessModel();
  testOnboardingStates();
  testEconomics();
  await testApprovalEmail();
  testSourceGuards();
  console.log("commercial-onboarding-after-approve-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
