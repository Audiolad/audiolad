#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  authorShareMinor,
  holdAvailableAt,
  platformShareMinor,
} from "../src/lib/payments/author-finance/types.ts";
import {
  canReceiveCanonicalAppreciationAccrual,
  isCommercialTermsFound,
} from "../src/lib/author-appreciation/finance-eligibility.ts";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");

const projectionMigration = read(
  "supabase/migrations/20260917120000_author_appreciation_finance_projection.sql",
);
const statusMigration = read(
  "supabase/migrations/20260918120000_author_appreciation_finance_projection_status.sql",
);
const intentsMigration = read(
  "supabase/migrations/20260916120000_author_appreciation_getcourse_intents.sql",
);
const ledgerMigration = read(
  "supabase/migrations/20260726140000_payments_p332_author_ledger.sql",
);
const roundingMigration = read(
  "supabase/migrations/20260728180000_author_share_rounding_up.sql",
);
const checkout = read("src/app/api/author-appreciation/checkout/route.ts");
const webhook = read("src/app/api/webhooks/getcourse/author-appreciation/route.ts");
const visibility = read("src/lib/author-appreciation/effective-visibility.ts");
const config = read("src/lib/author-appreciation/config.ts");
const termsHelper = read("src/lib/author-appreciation/current-terms.ts");
const financeEligibility = read("src/lib/author-appreciation/finance-eligibility.ts");

const ensureFn = statusMigration.slice(
  statusMigration.indexOf("CREATE OR REPLACE FUNCTION public.ensure_author_appreciation_sale_accrual"),
  statusMigration.indexOf("CREATE OR REPLACE FUNCTION public.reconcile_author_appreciation_paid_intents"),
);
const callbackFn = statusMigration.slice(
  statusMigration.lastIndexOf("CREATE OR REPLACE FUNCTION public.apply_author_appreciation_getcourse_callback"),
);
const reconcileFn = statusMigration.slice(
  statusMigration.indexOf("CREATE OR REPLACE FUNCTION public.reconcile_author_appreciation_paid_intents"),
  statusMigration.lastIndexOf("CREATE OR REPLACE FUNCTION public.apply_author_appreciation_getcourse_callback"),
);
const recordFn = statusMigration.slice(
  statusMigration.indexOf("CREATE OR REPLACE FUNCTION public.record_author_appreciation_finance_projection"),
  statusMigration.indexOf("CREATE OR REPLACE FUNCTION public.ensure_author_appreciation_sale_accrual"),
);

function testAPaidCallbackCreatesOneAccrual() {
  assert.match(callbackFn, /SET status = 'paid', paid_at = now()/);
  assert.match(
    callbackFn,
    /SET status = 'paid'[\s\S]*ensure_author_appreciation_sale_accrual\(v_intent\.id\)/,
  );
  assert.match(ensureFn, /'sale_accrual'/);
  assert.match(ensureFn, /author_appreciation_intent_id/);
  assert.match(callbackFn, /v_projection_outcome IN \('created', 'idempotent_replay'\)/);
  assert.match(callbackFn, /RETURN QUERY SELECT 'paid'::text, v_intent\.id;/);
}

function testBDuplicatePaidStillOneAccrual() {
  assert.match(
    callbackFn,
    /IF v_intent\.status = 'paid' THEN[\s\S]*ensure_author_appreciation_sale_accrual\(v_intent\.id\);[\s\S]*already_paid/,
  );
  assert.match(ensureFn, /outcome', 'idempotent_replay'/);
  assert.match(ensureFn, /result_code', 'accrual_exists'/);
}

function testCConcurrentRetryOneAccrual() {
  assert.match(
    projectionMigration,
    /CREATE UNIQUE INDEX IF NOT EXISTS author_ledger_entries_appreciation_sale_uidx/,
  );
  assert.match(ensureFn, /WHEN unique_violation THEN/);
  assert.match(ensureFn, /idempotency_key[\s\S]*'p332:appreciation:' \|\| v_intent\.id::text/);
}

function testDHistoricalPaidReconciliation() {
  assert.match(reconcileFn, /WHERE i\.status = 'paid'/);
  assert.match(reconcileFn, /finance_projection_status IS DISTINCT FROM 'projected'/);
  assert.match(reconcileFn, /NOT EXISTS/);
  assert.match(reconcileFn, /ensure_author_appreciation_sale_accrual\(v_intent\.id\)/);
  assert.match(statusMigration, /reconcile_author_appreciation_paid_intents\(10000\)/);
}

function testEReconciliationTwiceNoOp() {
  assert.match(ensureFn, /idempotent_replay/);
  assert.match(reconcileFn, /replayed/);
}

function testFGHNonPaidNoAccrual() {
  assert.match(ensureFn, /intent_failed/);
  assert.match(ensureFn, /intent_needs_review/);
  assert.match(ensureFn, /intent_pending/);
  assert.match(ensureFn, /v_intent\.status IS DISTINCT FROM 'paid'/);
  assert.match(reconcileFn, /WHERE i\.status = 'paid'/);
  assert.doesNotMatch(reconcileFn, /status IN \('failed'|status = 'pending'|status = 'needs_review'/);
}

function testIWrongAmountOfferNoAccrual() {
  const reviewBranch = callbackFn.slice(
    callbackFn.indexOf("v_intent.status <> 'pending'"),
    callbackFn.indexOf("SET status = 'paid'"),
  );
  assert.match(reviewBranch, /v_intent\.amount_minor <> p_amount_minor/);
  assert.match(reviewBranch, /provider_metadata->>'offer_id'/);
  assert.match(reviewBranch, /needs_review/);
  assert.doesNotMatch(reviewBranch, /ensure_author_appreciation_sale_accrual/);
}

function testJGrossFromIntentAmount() {
  assert.match(ensureFn, /author_share_minor\(v_intent\.amount_minor, v_bps\)/);
  assert.match(ensureFn, /gross_basis_minor[\s\S]*v_intent\.amount_minor/);
  assert.doesNotMatch(ensureFn, /author_share_minor\(p_amount_minor/);
}

function testKCommissionEqualsCanonical() {
  assert.match(ensureFn, /resolve_author_commercial_terms/);
  assert.match(ensureFn, /author_share_minor\(v_intent\.amount_minor, v_bps\)/);
  assert.match(roundingMigration, /ceil\(basis \* bps \/ 10000\)/);
  assert.match(ledgerMigration, /CREATE OR REPLACE FUNCTION public\.author_share_minor/);
  assert.equal(authorShareMinor(50_000, 7000), 35_000);
  assert.equal(platformShareMinor(50_000, 7000), 15_000);
  assert.equal(authorShareMinor(50_000, 7000), authorShareMinor(50_000, 7000));
}

function testLHoldEqualsCanonical() {
  assert.match(ensureFn, /v_effective \+ make_interval\(days => v_hold_days\)/);
  assert.match(ensureFn, /v_hold_days := \(v_terms ->> 'hold_days'\)::integer/);
  const paidAt = "2026-09-03T12:00:00.000Z";
  assert.equal(holdAvailableAt(paidAt, 14), "2026-09-17T12:00:00.000Z");
}

function testMBalanceProjection() {
  assert.match(projectionMigration, /author_ledger_payment_positions/);
  assert.match(
    projectionMigration,
    /e\.payment_id IS NOT NULL OR e\.author_appreciation_intent_id IS NOT NULL/,
  );
  assert.match(
    projectionMigration,
    /GROUP BY e\.author_id, e\.payment_id, e\.author_appreciation_intent_id/,
  );
  assert.match(
    projectionMigration,
    /e\.payment_id IS NULL\n\s+AND e\.author_appreciation_intent_id IS NULL/,
  );
}

function testNPayoutPipeline() {
  assert.match(ensureFn, /entry_type[\s\S]*'sale_accrual'/);
  assert.match(projectionMigration, /author_finance_p334_entries/);
  assert.match(projectionMigration, /author_finance_p334_type_key\(e\.entry_type\)/);
}

function testOPQNoFakeCommerce() {
  assert.doesNotMatch(ensureFn, /INSERT INTO public\.(orders|payments|user_practices)/);
  assert.doesNotMatch(callbackFn, /INSERT INTO public\.(orders|payments|user_practices)/);
  assert.doesNotMatch(reconcileFn, /INSERT INTO public\.(orders|payments|user_practices)/);
  assert.match(ensureFn, /NULL,\s*\n\s*NULL,\s*\n\s*v_intent\.practice_id/);
  assert.match(intentsMigration, /author_appreciation_payment_intents/);
}

function testAtomicCallbackAndXorSource() {
  assert.match(
    projectionMigration,
    /\(payment_id IS NOT NULL AND author_appreciation_intent_id IS NULL\)/,
  );
  assert.match(
    projectionMigration,
    /\(payment_id IS NULL AND author_appreciation_intent_id IS NOT NULL\)/,
  );
  assert.match(
    webhook,
    /apply_author_appreciation_getcourse_callback/,
  );
  assert.doesNotMatch(webhook, /ensure_author_appreciation_sale_accrual|@\/lib\/payments|@\/lib\/author-finance/);
}

function testPublicRolloutAndTerms() {
  assert.match(config, /AUTHOR_APPRECIATION_GETCOURSE_ROLLOUT_ENABLED === "1"/);
  assert.match(config, /return config\.enabled;/);
  assert.doesNotMatch(
    config.slice(config.indexOf("export function isAuthorAppreciationRolloutEnabled")),
    /allowedAuthorIds\.has/,
  );
  assert.match(visibility, /currentTermsAccepted/);
  assert.match(visibility, /!input\.currentTermsAccepted/);
  assert.doesNotMatch(
    visibility.slice(visibility.indexOf("export function resolveAuthorAppreciationVisibility")),
    /!input\.previewActive/,
  );
  assert.match(termsHelper, /hasAcceptedCurrentAuthorTerms/);
  assert.doesNotMatch(termsHelper, /"1\.1"/);
  assert.match(checkout, /hasAcceptedCurrentAppreciationTerms/);
  assert.doesNotMatch(checkout, /allowedAuthorIds/);
}

function testNoSeparateBalance() {
  assert.doesNotMatch(statusMigration, /appreciation_balance|donation_balance|special_payout/);
  assert.match(ensureFn, /'sale_accrual'/);
}

function testProviderPaidNeverRewrittenToFailed() {
  assert.doesNotMatch(callbackFn, /status = 'failed'/);
  assert.doesNotMatch(recordFn, /status = 'failed'/);
  assert.doesNotMatch(ensureFn, /SET\s+status\s*=\s*'failed'/);
  assert.match(callbackFn, /SET status = 'paid', paid_at = now()/);
  assert.match(
    callbackFn,
    /v_projection_outcome IN \('created', 'idempotent_replay'\)[\s\S]*paid_needs_review/,
  );
}

function testAccrualFailureIsExplicitNotSilent() {
  assert.match(statusMigration, /finance_projection_status text NOT NULL DEFAULT 'pending'/);
  assert.match(statusMigration, /CHECK \(finance_projection_status IN \('pending', 'projected', 'needs_review'\)\)/);
  assert.match(recordFn, /finance_projection_status = 'projected'/);
  assert.match(recordFn, /finance_projection_status = 'needs_review'/);
  assert.match(recordFn, /requires_review', 'skipped'/);
  assert.match(ensureFn, /record_author_appreciation_finance_projection/);
  assert.match(ensureFn, /author_not_payout_eligible/);
  assert.match(ensureFn, /no_active_terms|v_terms ->> 'reason'/);
  assert.match(callbackFn, /paid_needs_review/);
  assert.match(callbackFn, /already_paid_needs_review/);
}

function testReconciliationRetriesUnprojectedPaid() {
  assert.match(reconcileFn, /finance_projection_status IS DISTINCT FROM 'projected'/);
  assert.match(reconcileFn, /OR NOT EXISTS/);
  assert.match(
    statusMigration,
    /author_appreciation_intents_unprojected_paid_idx[\s\S]*status = 'paid' AND finance_projection_status IS DISTINCT FROM 'projected'/,
  );
}

function testCheckoutFailClosedWithoutCanonicalAccrual() {
  assert.match(checkout, /payout_eligible/);
  assert.match(checkout, /resolve_author_commercial_terms/);
  assert.match(checkout, /canReceiveCanonicalAppreciationAccrual/);
  assert.match(financeEligibility, /payoutEligible === true && input\.commercialTermsFound === true/);
  assert.equal(
    canReceiveCanonicalAppreciationAccrual({
      payoutEligible: true,
      commercialTermsFound: true,
    }),
    true,
  );
  assert.equal(
    canReceiveCanonicalAppreciationAccrual({
      payoutEligible: false,
      commercialTermsFound: true,
    }),
    false,
  );
  assert.equal(
    canReceiveCanonicalAppreciationAccrual({
      payoutEligible: true,
      commercialTermsFound: false,
    }),
    false,
  );
  assert.equal(isCommercialTermsFound({ found: true }), true);
  assert.equal(isCommercialTermsFound({ found: false, reason: "no_active_terms" }), false);
}

testAPaidCallbackCreatesOneAccrual();
testBDuplicatePaidStillOneAccrual();
testCConcurrentRetryOneAccrual();
testDHistoricalPaidReconciliation();
testEReconciliationTwiceNoOp();
testFGHNonPaidNoAccrual();
testIWrongAmountOfferNoAccrual();
testJGrossFromIntentAmount();
testKCommissionEqualsCanonical();
testLHoldEqualsCanonical();
testMBalanceProjection();
testNPayoutPipeline();
testOPQNoFakeCommerce();
testAtomicCallbackAndXorSource();
testPublicRolloutAndTerms();
testNoSeparateBalance();
testProviderPaidNeverRewrittenToFailed();
testAccrualFailureIsExplicitNotSilent();
testReconciliationRetriesUnprojectedPaid();
testCheckoutFailClosedWithoutCanonicalAccrual();

console.log("author-appreciation-finance-unit: ok");
