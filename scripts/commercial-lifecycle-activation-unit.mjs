#!/usr/bin/env node
/**
 * Lifecycle regression: commercial application → terms → active.
 * Guards against stuck «Коммерческий статус активируется».
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveAuthorStatusView } from "../src/lib/author-dashboard/author-status.ts";
import {
  authorAccessAllowsPaidProducts,
  isAuthorCommercialActiveAccess,
} from "../src/lib/authors/access.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function status(overrides = {}) {
  return resolveAuthorStatusView({
    accessStatus: "free",
    applicationStatus: null,
    applicationSubmittedAt: null,
    applicationReviewComment: null,
    termsAccepted: false,
    publishedTermsAvailable: true,
    payoutProfileStatus: null,
    payoutReviewComment: null,
    individualShare: null,
    role: "owner",
    authorSlug: "demo-author",
    hasPublishedFreeProduct: true,
    ...overrides,
  });
}

// 1) Application created → waiting (pending)
{
  const view = status({
    accessStatus: "commercial_pending",
    applicationStatus: "submitted",
    applicationSubmittedAt: "2026-09-19T13:02:51.111Z",
  });
  assert.equal(view.kind, "commercial_pending");
  assert.equal(view.paidProductsLocked, true);
  assert.match(view.cta.label, /Заявка рассматривается/);
  assert.equal(authorAccessAllowsPaidProducts("commercial_pending"), false);
}

// 2) Terms accepted while still pending / before approve → still waiting admin
{
  const view = status({
    accessStatus: "commercial_pending",
    applicationStatus: "in_review",
    termsAccepted: true,
  });
  assert.equal(view.kind, "commercial_pending");
  assert.notEqual(view.cta.label, "Коммерческий статус активируется");
}

// 3) Admin approved, terms not yet accepted → ready for terms
{
  const view = status({
    accessStatus: "commercial_onboarding",
    applicationStatus: "approved",
    termsAccepted: false,
  });
  assert.equal(view.kind, "commercial_ready_for_terms");
  assert.match(view.cta.label, /Принять Авторские условия/);
  assert.equal(view.paidProductsLocked, true);
}

// 4) Admin approved + terms accepted but access not flipped → activating (legacy race)
{
  const view = status({
    accessStatus: "commercial_onboarding",
    applicationStatus: "approved",
    termsAccepted: true,
  });
  assert.equal(view.cta.label, "Коммерческий статус активируется");
  assert.equal(view.paidProductsLocked, true);
  assert.equal(isAuthorCommercialActiveAccess("commercial_onboarding"), false);
}

// 5) After activation → commercial active; refresh/login keep active
{
  const view = status({
    accessStatus: "commercial_active",
    applicationStatus: "approved",
    termsAccepted: true,
  });
  assert.equal(view.kind, "commercial_active");
  assert.equal(view.paidProductsLocked, false);
  assert.equal(authorAccessAllowsPaidProducts("commercial_active"), true);

  const again = status({
    accessStatus: "commercial_active",
    applicationStatus: "approved",
    termsAccepted: true,
  });
  assert.equal(again.kind, "commercial_active");
}

// 6) Source contracts: approve finalizes when terms already accepted
{
  const migration = read(
    "supabase/migrations/20261026120100_commercial_activate_on_approve_if_terms.sql",
  );
  assert.match(migration, /author_terms_already_accepted_on_approve/);
  assert.match(migration, /backfill_terms_accepted_before_approve/);
  assert.match(migration, /commercial_active/);
  assert.match(migration, /is_current = true/);

  const approveAction = read(
    "src/app/(platform)/admin/commercial-applications/actions.ts",
  );
  assert.match(
    approveAction,
    /activateCommercialAccessAfterTermsAccepted/,
  );
  assert.match(
    approveAction,
    /author_terms_already_accepted_on_approve/,
  );
  assert.match(approveAction, /hasAcceptedCurrentAuthorTerms/);

  const loadStatus = read("src/lib/author-dashboard/load-author-status.ts");
  assert.match(
    loadStatus,
    /author_terms_accepted_status_page_heal/,
  );
  assert.match(
    loadStatus,
    /activateCommercialAccessAfterTermsAccepted/,
  );

  const activate = read("src/lib/authors/activate-commercial-after-terms.ts");
  assert.match(activate, /commercial_onboarding/);
  assert.match(activate, /commercial_active/);
  assert.match(activate, /reason\?/);
}

// 7) Idempotent approve path still heals (SQL + TS)
{
  const migration = read(
    "supabase/migrations/20261026120100_commercial_activate_on_approve_if_terms.sql",
  );
  // Idempotent branch must still check terms and promote
  const idempotentIdx = migration.indexOf("IF v_row.status = 'approved' THEN");
  assert.ok(idempotentIdx > 0);
  const idempotentBlock = migration.slice(
    idempotentIdx,
    migration.indexOf("IF v_row.status NOT IN", idempotentIdx),
  );
  assert.match(idempotentBlock, /author_terms_already_accepted_on_approve/);
  assert.match(idempotentBlock, /commercial_onboarding/);
}

// 8) Impossible forever-activating once healed access is commercial_active
{
  const healed = status({
    accessStatus: "commercial_active",
    applicationStatus: "approved",
    termsAccepted: true,
  });
  assert.notEqual(healed.cta.label, "Коммерческий статус активируется");
  assert.equal(healed.kind, "commercial_active");
}


// 9) Approval email edge: already-accepted terms must not ask to accept again
{
  const emailTpl = read(
    "src/lib/email/templates/commercial-application-approved.ts",
  );
  assert.match(emailTpl, /getCommercialAuthorTermsUrl/);
  assert.match(emailTpl, /termsAlreadyAccepted/);
  assert.match(emailTpl, /Принять авторское соглашение/);
  assert.match(emailTpl, /\/author-dashboard\/commercial\/terms/);

  const sendSrc = read(
    "src/lib/email/send-commercial-application-approved-email.ts",
  );
  assert.match(sendSrc, /termsAlreadyAccepted/);
  assert.match(sendSrc, /acquireOperationalEmailDelivery/);

  const actions = read(
    "src/app/(platform)/admin/commercial-applications/actions.ts",
  );
  assert.match(actions, /!rpc\.result\.idempotent/);
  assert.match(actions, /sendCommercialApplicationApprovedEmail/);
  assert.match(actions, /termsAlreadyAccepted/);
}

console.log("commercial-lifecycle-activation-unit: ok");
