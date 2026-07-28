#!/usr/bin/env node
/**
 * Finance cabinet Author Terms UI contracts.
 * No database. Guards the separation of Author Terms vs ledger commercial terms.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getAuthorFinanceEmptyStateCopy,
} from "../src/lib/author-finance/labels.ts";
import {
  resolveAuthorFinanceAuthorTermsUi,
  selectAuthorFinanceEmptyState,
} from "../src/lib/author-finance/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const base = {
  payoutEligible: false,
  accessStatus: "commercial_active",
  approvedTermsCount: 0,
  entryCount: 0,
  payableMinor: 0,
  reservedMinor: 0,
  heldMinor: 0,
  paidPayoutCount: 0,
  authorTermsAccepted: true,
};

// 1. commercial_active + Author Terms accepted → no "условия не согласованы"
{
  const code = selectAuthorFinanceEmptyState(base);
  const copy = getAuthorFinanceEmptyStateCopy(code);
  const ui = resolveAuthorFinanceAuthorTermsUi({
    accessStatus: "commercial_active",
    authorTermsAccepted: true,
  });
  assert.notEqual(code, "terms_missing");
  assert.equal(code, "no_sales");
  assert.doesNotMatch(copy.title, /Ждём согласования условий/);
  assert.doesNotMatch(copy.body, /Действующих коммерческих условий пока нет/);
  assert.equal(ui.badge, "Авторские условия приняты");
  assert.doesNotMatch(ui.badge, /не согласованы/);
}

// 2. commercial_onboarding + terms not accepted → Author Terms CTA state
{
  const code = selectAuthorFinanceEmptyState({
    ...base,
    accessStatus: "commercial_onboarding",
    authorTermsAccepted: false,
  });
  const ui = resolveAuthorFinanceAuthorTermsUi({
    accessStatus: "commercial_onboarding",
    authorTermsAccepted: false,
  });
  assert.equal(code, "author_terms_required");
  assert.equal(ui.showAcceptCta, true);
  assert.match(ui.body, /Авторские условия/);
}

// 3. commercial_active + zero balance → no waiting-for-terms empty state
{
  const code = selectAuthorFinanceEmptyState({
    ...base,
    payableMinor: 0,
    entryCount: 0,
    approvedTermsCount: 0,
  });
  assert.notEqual(code, "terms_missing");
  assert.equal(code, "no_sales");
}

// 4. payout profile absence does not drive terms status helper
{
  const banner = read("src/lib/author-finance/payout-profile-banner.ts");
  assert.doesNotMatch(banner, /selectAuthorFinanceEmptyState/);
  assert.doesNotMatch(banner, /authorTermsAccepted/);
  const ui = resolveAuthorFinanceAuthorTermsUi({
    accessStatus: "commercial_active",
    authorTermsAccepted: true,
  });
  assert.equal(ui.badge, "Авторские условия приняты");
}

// 5–6. Activation provisions payee setup; legacy finance gap does not override Author Terms
{
  const activate = read("src/lib/authors/activate-commercial-after-terms.ts");
  assert.match(activate, /ensureCommercialPayeeSetupAfterTerms/);
  assert.doesNotMatch(activate, /payout_profile|author_payout_profiles/);

  const setup = read("src/lib/authors/ensure-commercial-payee-setup.ts");
  assert.match(setup, /AUTHOR_COMMERCIAL_SHARE_BPS/);
  assert.match(setup, /approveImmediately:\s*true/);
  assert.match(setup, /payout_eligible:\s*true/);

  const client = read(
    "src/components/author-dashboard/AuthorFinanceClient.tsx",
  );
  assert.match(client, /resolveAuthorFinanceAuthorTermsUi/);
  assert.match(client, /authorTermsUi\.badge/);
  assert.match(client, /Принять Авторские условия/);
  assert.doesNotMatch(client, /Условия не согласованы/);
  assert.doesNotMatch(
    client,
    /Действующих коммерческих условий пока нет/,
  );
  assert.doesNotMatch(client, /getAuthorFinanceTermsStatusLabel/);
}

// 7. Selected author_id is the finance membership claim
{
  const guard = read("src/lib/author-finance/route-guard.ts");
  assert.match(guard, /requireAuthorMembership\(claimed\)/);
  assert.match(guard, /authorId: claimed/);
  const queries = read("src/lib/author-finance/queries.ts");
  assert.match(queries, /hasAcceptedCurrentAuthorTerms\(input\.authorId\)/);
  assert.match(queries, /p_author_id: input\.authorId/);
}

console.log("finance-author-terms-ui-unit: ok");
