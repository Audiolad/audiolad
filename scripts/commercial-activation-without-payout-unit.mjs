#!/usr/bin/env node
/**
 * Regression: payout profile must not gate commercial activation / sales.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMERCIAL_ONBOARDING_REQUIRED_STEP_COUNT,
  DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
  evaluateCommercialOnboardingChecklist,
} from "../src/lib/author-dashboard/commercial-onboarding.ts";
import { resolveAuthorStatusView } from "../src/lib/author-dashboard/author-status.ts";
import {
  AUTHOR_FINANCE_PAYOUT_PROFILE_MISSING_COPY,
  AUTHOR_PAYOUT_ACTION_REQUIRES_PROFILE_COPY,
  shouldShowFinancePayoutProfileBanner,
} from "../src/lib/author-finance/payout-profile-banner.ts";
import {
  isPayoutProfileReadyForWithdrawal,
  isPayoutProfileVerified,
} from "../src/lib/author-payout-profiles/onboarding-complete.ts";
import {
  authorAccessAllowsPaidProducts,
  getPaidPricingDisabledReason,
} from "../src/lib/authors/access.ts";
import { resolveAuthorCommercialCapabilities } from "../src/lib/authors/commercial-capabilities.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function statusView(overrides = {}) {
  return resolveAuthorStatusView({
    accessStatus: "commercial_active",
    applicationStatus: "approved",
    termsAccepted: true,
    publishedTermsAvailable: true,
    payoutProfileStatus: null,
    role: "owner",
    authorSlug: "demo-author",
    ...overrides,
  });
}

function checklist(overrides = {}) {
  return evaluateCommercialOnboardingChecklist({
    authorSlug: "demo-author",
    accessStatus: "commercial_active",
    freeGateReady: true,
    products: [],
    campaigns: [],
    applicationStatus: "approved",
    termsAccepted: true,
    payoutProfileStatus: null,
    capabilities: {
      ...DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
      payoutDetailsAvailable: true,
      termsAcceptanceAvailable: true,
    },
    payoutDetailsHref: "/author-dashboard/commercial/payout-details?author=demo",
    termsHref: "/author-dashboard/commercial/terms?author=demo",
    ...overrides,
  });
}

// 1. Terms accept path activates commercial_active without payout profile
{
  const activateSrc = read("src/lib/authors/activate-commercial-after-terms.ts");
  assert.match(activateSrc, /commercial_active/);
  assert.match(activateSrc, /author_terms_accepted/);
  assert.match(activateSrc, /ensureCommercialPayeeSetupAfterTerms/);
  assert.doesNotMatch(activateSrc, /payout_profile|author_payout_profiles/);

  const setupSrc = read("src/lib/authors/ensure-commercial-payee-setup.ts");
  assert.match(setupSrc, /approveImmediately:\s*true/);
  assert.match(setupSrc, /payout_eligible:\s*true/);
  assert.doesNotMatch(setupSrc, /payout_profile|author_payout_profiles/);

  const termsService = read("src/lib/author-terms/service.ts");
  assert.match(
    termsService,
    /activateCommercialAccessAfterTermsAccepted/,
  );

  const view = statusView({
    accessStatus: "commercial_active",
    payoutProfileStatus: null,
  });
  assert.equal(view.kind, "commercial_active");
  assert.equal(view.paidProductsLocked, false);
}

// 2–3. commercial_active without payout can create/publish paid products
{
  assert.equal(authorAccessAllowsPaidProducts("commercial_active"), true);
  assert.equal(getPaidPricingDisabledReason("commercial_active"), null);

  const caps = resolveAuthorCommercialCapabilities({
    accessStatus: "commercial_active",
  });
  assert.equal(caps.can_create_paid_product, true);
  assert.equal(caps.can_publish_paid_product, true);

  const view = statusView({ payoutProfileStatus: null });
  assert.equal(view.cta.label, "Создать платный продукт");
  assert.ok(view.cta.href?.includes("/author-dashboard/products"));
}

// 4–5. Purchase/accrual paths are not gated by payout profile (source contract)
{
  const financeAccrual = read(
    "src/lib/payments/author-finance/finance-rpc.ts",
  );
  assert.doesNotMatch(financeAccrual, /author_payout_profiles/);
  assert.doesNotMatch(financeAccrual, /payout_profile/);

  const paidGate = read("src/lib/authors/access.ts");
  assert.match(paidGate, /isAuthorCommercialActiveAccess/);
  assert.doesNotMatch(
    paidGate.slice(
      paidGate.indexOf("authorAccessAllowsPaidProducts"),
      paidGate.indexOf("authorAccessAllowsPaidProducts") + 250,
    ),
    /payout/i,
  );
}

// 6. Finance stats remain available; banner is informational only
{
  assert.equal(
    shouldShowFinancePayoutProfileBanner({
      featureEnabled: true,
      payoutProfileStatus: null,
    }),
    true,
  );
  assert.equal(
    shouldShowFinancePayoutProfileBanner({
      featureEnabled: true,
      payoutProfileStatus: "verified",
    }),
    false,
  );
  assert.equal(
    shouldShowFinancePayoutProfileBanner({
      featureEnabled: false,
      payoutProfileStatus: null,
    }),
    false,
  );
  assert.match(
    AUTHOR_FINANCE_PAYOUT_PROFILE_MISSING_COPY.description,
    /пока не заполнены/,
  );

  const financeClient = read(
    "src/components/author-dashboard/AuthorFinanceClient.tsx",
  );
  assert.match(financeClient, /shouldShowFinancePayoutProfileBanner/);
  assert.doesNotMatch(financeClient, /pointer-events-none|opacity-40.*summary/i);
}

// 7. Missing payout does not leave commercial onboarding incomplete by itself
{
  const section = checklist({
    products: [
      {
        id: "p1",
        slug: "paid-demo",
        title: "Paid",
        status: "published",
        is_free: false,
        updated_at: "2026-07-01T10:00:00.000Z",
        readiness: {
          ok: true,
          completedCount: 5,
          totalCount: 5,
          requirements: [],
        },
      },
    ],
    campaigns: [
      {
        id: "c1",
        status: "active",
        practice_id: "p1",
        practice_status: "published",
      },
    ],
    payoutProfileStatus: null,
  });
  assert.equal(section.totalCount, COMMERCIAL_ONBOARDING_REQUIRED_STEP_COUNT);
  assert.equal(section.complete, true);
  assert.equal(section.steps.at(-1)?.id, "payout_details");
  assert.equal(section.steps.at(-1)?.statusLabel, "Не заполнено");
  assert.match(
    section.steps.at(-1)?.hint ?? "",
    /Можно заполнить позже/,
  );
}

// 8. Only payout/withdrawal action requires verified requisites
{
  assert.equal(isPayoutProfileReadyForWithdrawal(null), false);
  assert.equal(isPayoutProfileReadyForWithdrawal("draft"), false);
  assert.equal(isPayoutProfileReadyForWithdrawal("needs_changes"), false);
  assert.equal(isPayoutProfileReadyForWithdrawal("verified"), true);
  assert.equal(isPayoutProfileVerified("needs_changes"), false);

  const payoutRpc = read("src/lib/payments/author-finance/payout-rpc.ts");
  assert.match(payoutRpc, /"payout_profile_required"/);
  assert.match(payoutRpc, /isPayoutProfilesEnabled/);
  assert.match(payoutRpc, /isPayoutProfileReadyForWithdrawal/);
  assert.match(
    AUTHOR_PAYOUT_ACTION_REQUIRES_PROFILE_COPY.description,
    /Для получения выплаты сначала заполните реквизиты/,
  );
}

// 9. needs_changes does not disable commercial access / sales
{
  const view = statusView({ payoutProfileStatus: "needs_changes" });
  assert.equal(view.kind, "commercial_active");
  assert.equal(view.paidProductsLocked, false);
  assert.equal(authorAccessAllowsPaidProducts("commercial_active"), true);
  assert.equal(view.optionalPayout?.cta.label, "Уточнить реквизиты");
}

// 10. Suspended / terminated remain blocked regardless of payout profile
{
  for (const accessStatus of [
    "commercial_suspended",
    "suspended",
    "terminated",
  ]) {
    assert.equal(authorAccessAllowsPaidProducts(accessStatus), false);
    const view = statusView({
      accessStatus,
      payoutProfileStatus: "verified",
    });
    assert.equal(view.paidProductsLocked, true);
    assert.notEqual(view.kind, "commercial_active");
  }

  const suspendedCaps = resolveAuthorCommercialCapabilities({
    accessStatus: "commercial_suspended",
  });
  assert.equal(suspendedCaps.can_create_paid_product, false);
  assert.equal(suspendedCaps.can_publish_paid_product, false);
}

// Forbidden onboarding / status copy
{
  const statusSrc = read("src/lib/author-dashboard/author-status.ts");
  const clientSrc = read(
    "src/components/author-dashboard/AuthorStatusClient.tsx",
  );
  for (const src of [statusSrc, clientSrc]) {
    assert.doesNotMatch(src, /Завершите коммерческое подключение/);
    assert.doesNotMatch(src, /Для активации заполните реквизиты/);
    assert.doesNotMatch(src, /Коммерческий кабинет ещё не готов/);
  }
  assert.match(clientSrc, /Коммерческий статус активен/);
}

console.log("commercial-activation-without-payout-unit: ok");
