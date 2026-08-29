#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
  evaluateCommercialOnboardingChecklist,
  resolveCommercialApplicationStatus,
} from "../src/lib/author-dashboard/commercial-onboarding.ts";
import {
  parseCommercialApplicationRpcResult,
} from "../src/lib/author-commercial-applications/rpc.ts";
import {
  AUTHOR_COMMERCIAL_APPLICATION_LIMITS,
  mapCommercialApplicationRpcError,
  normalizeCommercialApplicationFormValues,
  validateCommercialApplicationFormValues,
} from "../src/lib/author-commercial-applications/validation.ts";
import {
  authorAccessAllowsPaidProducts,
  isAuthorCommercialApprovedAccess,
} from "../src/lib/authors/access.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function evaluateCommercial(overrides = {}) {
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

function stepById(section, id) {
  const step = section.steps.find((item) => item.id === id);
  assert.ok(step, `expected commercial onboarding step "${id}"`);
  return step;
}

function validForm() {
  return {
    plannedProducts:
      "Планирую размещать платные медитации на сон и короткие практики для утреннего настроя.",
    topics: "Сон, спокойствие, женская энергия",
    formatPlan: "Отдельные практики",
    rightsConfirmation: true,
    teamComment: "Готова обсудить форматы",
  };
}

function testValidationAndRpcParsing() {
  const incomplete = validateCommercialApplicationFormValues(
    normalizeCommercialApplicationFormValues({
      plannedProducts: "коротко",
      topics: "",
      formatPlan: "",
      rightsConfirmation: false,
    }),
    { requireSubmitRules: true },
  );
  assert.ok(incomplete.plannedProducts);
  assert.ok(incomplete.topics);
  assert.ok(incomplete.formatPlan);
  assert.ok(incomplete.rightsConfirmation);

  const draftOk = validateCommercialApplicationFormValues(
    normalizeCommercialApplicationFormValues({
      plannedProducts: "черновик",
      topics: "",
      formatPlan: "",
      rightsConfirmation: false,
    }),
    { requireSubmitRules: false },
  );
  assert.equal(Object.keys(draftOk).length, 0);

  const valid = validateCommercialApplicationFormValues(validForm(), {
    requireSubmitRules: true,
  });
  assert.equal(Object.keys(valid).length, 0);
  assert.ok(
    validForm().plannedProducts.length >=
      AUTHOR_COMMERCIAL_APPLICATION_LIMITS.plannedProductsMin,
  );

  const parsed = parseCommercialApplicationRpcResult({
    ok: true,
    application_id: "app-1",
    status: "submitted",
    access_status: "commercial_pending",
  });
  assert.equal(parsed?.status, "submitted");
  assert.equal(parsed?.access_status, "commercial_pending");
  assert.equal(parseCommercialApplicationRpcResult({ ok: false }), null);

  assert.match(
    mapCommercialApplicationRpcError("commercial_application_already_active"),
    /уже/i,
  );
  assert.match(
    mapCommercialApplicationRpcError("forbidden"),
    /прав/i,
  );
}

function testOnboardingCommercialApplicationFlow() {
  // 1. Free gate not ready → locked
  const gated = evaluateCommercial({ freeGateReady: false });
  assert.equal(gated.steps[0].state, "locked");
  assert.equal(gated.steps[0].statusLabel, "Пока недоступно");

  // 2. Free gate ready → Подать заявку
  const open = evaluateCommercial({ freeGateReady: true, accessStatus: "free" });
  assert.equal(open.steps[0].state, "active");
  assert.equal(open.steps[0].actionLabel, "Подать заявку");
  assert.match(open.steps[0].href ?? "", /commercial-application/);

  // 3. Draft
  const draft = evaluateCommercial({
    applicationStatus: "draft",
  });
  assert.equal(draft.steps[0].statusLabel, "Черновик");
  assert.equal(draft.steps[0].actionLabel, "Продолжить заполнение");

  // 4–6. Submitted — application active; terms/paid/payout still locked
  const submitted = evaluateCommercial({
    accessStatus: "commercial_pending",
    applicationStatus: "submitted",
  });
  const submittedApp = stepById(submitted, "commercial_application");
  assert.equal(submittedApp.statusLabel, "Заявка отправлена");
  assert.match(submittedApp.description, /получили заявку/i);
  assert.equal(submittedApp.actionLabel, "Смотреть заявку");
  assert.equal(stepById(submitted, "terms_acceptance").state, "locked");
  assert.equal(stepById(submitted, "paid_product").state, "locked");
  assert.equal(
    submitted.steps.some((step) => step.id === "payout_details"),
    false,
  );
  assert.equal(authorAccessAllowsPaidProducts("commercial_pending"), false);

  // 7. In review
  const inReview = evaluateCommercial({
    accessStatus: "commercial_pending",
    applicationStatus: "in_review",
  });
  assert.equal(
    stepById(inReview, "commercial_application").statusLabel,
    "На рассмотрении",
  );

  // 8. Needs changes with comment
  const needsChanges = evaluateCommercial({
    accessStatus: "commercial_pending",
    applicationStatus: "needs_changes",
    applicationReviewComment: "Уточните тематику продуктов.",
  });
  const needsChangesApp = stepById(needsChanges, "commercial_application");
  assert.equal(needsChangesApp.statusLabel, "Нужно уточнить данные");
  assert.equal(needsChangesApp.actionLabel, "Исправить заявку");
  assert.equal(needsChangesApp.hint, "Уточните тематику продуктов.");

  // 9. Resubmit path after needs_changes stays editable CTA
  assert.match(needsChangesApp.href ?? "", /commercial-application/);

  // 10–11. Approved → commercial_onboarding: terms first, paid locked, payout
  // waits for terms. Approval ≠ commercial_active / paid rights.
  assert.equal(
    isAuthorCommercialApprovedAccess("commercial_onboarding"),
    true,
  );
  assert.equal(authorAccessAllowsPaidProducts("commercial_onboarding"), false);
  assert.equal(
    resolveCommercialApplicationStatus({
      accessStatus: "commercial_onboarding",
      applicationStatus: "approved",
    }),
    "approved",
  );

  const approved = evaluateCommercial({
    accessStatus: "commercial_onboarding",
    applicationStatus: "approved",
    capabilities: {
      ...DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
      payoutDetailsAvailable: true,
      termsAcceptanceAvailable: true,
    },
    payoutDetailsHref: "/author-dashboard/commercial/payout-details",
    termsHref: "/author-dashboard/commercial/terms",
  });
  const approvedApp = stepById(approved, "commercial_application");
  const approvedTerms = stepById(approved, "terms_acceptance");
  const approvedPaid = stepById(approved, "paid_product");
  assert.equal(approvedApp.state, "completed");
  assert.equal(approvedTerms.state, "active");
  assert.equal(approvedTerms.actionLabel, "Открыть условия");
  assert.match(approvedTerms.href ?? "", /\/terms/);
  assert.equal(approvedPaid.state, "locked");
  assert.match(
    approvedPaid.hint ?? "",
    /Сначала примите Авторские условия сотрудничества/,
  );
  assert.doesNotMatch(
    approvedPaid.hint ?? "",
    /Сначала нужна одобренная коммерческая заявка/,
  );
  assert.equal(
    approved.steps.some((step) => step.id === "payout_details"),
    false,
  );

  // Terms accepted while still commercial_onboarding: payout may open,
  // but paid products stay gated until commercial_active.
  const termsDoneOnboarding = evaluateCommercial({
    accessStatus: "commercial_onboarding",
    applicationStatus: "approved",
    termsAccepted: true,
    capabilities: {
      ...DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
      payoutDetailsAvailable: true,
      termsAcceptanceAvailable: true,
    },
    payoutDetailsHref: "/author-dashboard/commercial/payout-details",
    termsHref: "/author-dashboard/commercial/terms",
  });
  assert.equal(
    stepById(termsDoneOnboarding, "terms_acceptance").state,
    "completed",
  );
  assert.equal(stepById(termsDoneOnboarding, "paid_product").state, "locked");
  assert.equal(
    termsDoneOnboarding.steps.some((step) => step.id === "payout_details"),
    false,
  );
  assert.equal(authorAccessAllowsPaidProducts("commercial_onboarding"), false);

  // commercial_active after terms: paid create unlocks; payout stays optional
  assert.equal(authorAccessAllowsPaidProducts("commercial_active"), true);
  const commercialActive = evaluateCommercial({
    accessStatus: "commercial_active",
    applicationStatus: "approved",
    termsAccepted: true,
    capabilities: {
      ...DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
      payoutDetailsAvailable: true,
      termsAcceptanceAvailable: true,
    },
    payoutDetailsHref: "/author-dashboard/commercial/payout-details",
    termsHref: "/author-dashboard/commercial/terms",
  });
  assert.equal(
    stepById(commercialActive, "terms_acceptance").state,
    "completed",
  );
  assert.equal(stepById(commercialActive, "paid_product").state, "active");
  assert.equal(
    stepById(commercialActive, "paid_product").actionLabel,
    "Создать платный продукт",
  );
  assert.equal(
    commercialActive.steps.some((step) => step.id === "payout_details"),
    false,
  );

  // 12. Rejected — no reapply CTA
  const rejected = evaluateCommercial({
    accessStatus: "free",
    applicationStatus: "rejected",
    applicationReviewComment: "Пока недостаточно материалов.",
  });
  const rejectedApp = stepById(rejected, "commercial_application");
  assert.equal(rejectedApp.statusLabel, "Заявка не одобрена");
  assert.equal(rejectedApp.actionLabel, "Смотреть заявку");
  assert.notEqual(rejectedApp.actionLabel, "Подать заявку");
  assert.equal(rejectedApp.hint, "Пока недостаточно материалов.");
  assert.equal(stepById(rejected, "paid_product").state, "locked");

  // 13. Legacy commercial / commercial_active without application row
  assert.equal(
    resolveCommercialApplicationStatus({ accessStatus: "commercial" }),
    "approved",
  );
  assert.equal(
    resolveCommercialApplicationStatus({ accessStatus: "commercial_active" }),
    "approved",
  );
  const legacyCommercial = evaluateCommercial({
    accessStatus: "commercial_active",
    applicationStatus: null,
    capabilities: {
      ...DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES,
      payoutDetailsAvailable: true,
      termsAcceptanceAvailable: true,
    },
    payoutDetailsComplete: true,
    termsAccepted: true,
  });
  assert.equal(
    stepById(legacyCommercial, "commercial_application").state,
    "completed",
  );

  // 14. Legacy commercial_pending without row
  const legacyPending = evaluateCommercial({
    accessStatus: "commercial_pending",
    applicationStatus: null,
    legacyPendingWithoutApplication: true,
  });
  const legacyPendingApp = stepById(legacyPending, "commercial_application");
  assert.equal(legacyPendingApp.statusLabel, "На рассмотрении");
  assert.equal(legacyPendingApp.actionLabel, undefined);
  assert.equal(legacyPendingApp.href, undefined);
}

function testSourceGuards() {
  const migration = read(
    "supabase/migrations/20260725230000_author_commercial_applications.sql",
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.author_commercial_applications/);
  assert.match(migration, /submit_author_commercial_application/);
  assert.match(migration, /approve_author_commercial_application/);
  assert.match(migration, /reject_author_commercial_application/);
  assert.match(migration, /commercial_pending/);
  assert.match(
    migration,
    /author_commercial_applications_author_non_withdrawn_unique_idx/,
  );
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /approve_author_application\(/);

  const api = read("src/app/api/author/commercial-application/route.ts");
  assert.match(api, /requireAuthorMembership/);
  assert.match(api, /submitAuthorCommercialApplication/);
  assert.match(api, /saveAuthorCommercialApplicationDraft/);
  assert.match(api, /sendCommercialApplicationAdminAlertEmail/);
  assert.match(api, /idempotent/);
  assert.doesNotMatch(api, /status:\s*["']approved["']/);

  const form = read(
    "src/components/author-dashboard/AuthorCommercialApplicationForm.tsx",
  );
  assert.match(form, /После одобрения заявки мы откроем следующие шаги/);
  assert.match(form, /Отправить заявку/);

  const nav = read("src/lib/admin/nav.ts");
  assert.match(nav, /commercial-applications/);
  assert.match(nav, /Коммерческие заявки/);

  assert.match(
    read("src/lib/author-dashboard/commercial-onboarding.ts"),
    /applicationSubmissionAvailable:\s*true/,
  );
  assert.match(
    read("src/lib/author-dashboard/load-onboarding-state.ts"),
    /getAuthorCommercialApplication/,
  );
}

function main() {
  testValidationAndRpcParsing();
  testOnboardingCommercialApplicationFlow();
  testSourceGuards();
  console.log("author-commercial-application-unit: ok");
}

main();
