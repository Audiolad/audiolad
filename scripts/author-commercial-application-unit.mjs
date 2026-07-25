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

  // 4–6. Submitted
  const submitted = evaluateCommercial({
    accessStatus: "commercial_pending",
    applicationStatus: "submitted",
  });
  assert.equal(submitted.steps[0].statusLabel, "Заявка отправлена");
  assert.match(submitted.steps[0].description, /получили заявку/i);
  assert.equal(submitted.steps[0].actionLabel, "Смотреть заявку");
  assert.equal(submitted.steps[1].state, "locked");
  assert.equal(submitted.steps[3].state, "locked");

  // 7. In review
  const inReview = evaluateCommercial({
    accessStatus: "commercial_pending",
    applicationStatus: "in_review",
  });
  assert.equal(inReview.steps[0].statusLabel, "На рассмотрении");

  // 8. Needs changes with comment
  const needsChanges = evaluateCommercial({
    accessStatus: "commercial_pending",
    applicationStatus: "needs_changes",
    applicationReviewComment: "Уточните тематику продуктов.",
  });
  assert.equal(needsChanges.steps[0].statusLabel, "Нужно уточнить данные");
  assert.equal(needsChanges.steps[0].actionLabel, "Исправить заявку");
  assert.equal(needsChanges.steps[0].hint, "Уточните тематику продуктов.");

  // 9. Resubmit path after needs_changes stays editable CTA
  assert.match(needsChanges.steps[0].href ?? "", /commercial-application/);

  // 10–11. Approved → access commercial, payout/terms coming_soon
  const approved = evaluateCommercial({
    accessStatus: "commercial",
    applicationStatus: "approved",
  });
  assert.equal(approved.steps[0].state, "completed");
  assert.equal(approved.steps[1].state, "coming_soon");
  assert.equal(approved.steps[2].state, "coming_soon");
  assert.equal(approved.steps[1].statusLabel, "Скоро будет доступно");
  assert.equal(approved.steps[2].statusLabel, "Скоро будет доступно");

  // 12. Rejected — no reapply CTA
  const rejected = evaluateCommercial({
    accessStatus: "free",
    applicationStatus: "rejected",
    applicationReviewComment: "Пока недостаточно материалов.",
  });
  assert.equal(rejected.steps[0].statusLabel, "Заявка не одобрена");
  assert.equal(rejected.steps[0].actionLabel, "Смотреть заявку");
  assert.notEqual(rejected.steps[0].actionLabel, "Подать заявку");
  assert.equal(rejected.steps[0].hint, "Пока недостаточно материалов.");

  // 13. Legacy commercial without application row
  assert.equal(
    resolveCommercialApplicationStatus({ accessStatus: "commercial" }),
    "approved",
  );
  const legacyCommercial = evaluateCommercial({
    accessStatus: "commercial",
    applicationStatus: null,
  });
  assert.equal(legacyCommercial.steps[0].state, "completed");

  // 14. Legacy commercial_pending without row
  const legacyPending = evaluateCommercial({
    accessStatus: "commercial_pending",
    applicationStatus: null,
    legacyPendingWithoutApplication: true,
  });
  assert.equal(legacyPending.steps[0].statusLabel, "На рассмотрении");
  assert.equal(legacyPending.steps[0].actionLabel, undefined);
  assert.equal(legacyPending.steps[0].href, undefined);

  // 17–18. Paid product stays locked while payout/terms incomplete
  assert.equal(approved.steps[3].state, "locked");
  assert.match(
    approved.steps[3].hint ?? "",
    /данные для выплат|условия сотрудничества/i,
  );
}

function testSourceGuards() {
  const migration = read(
    "supabase/migrations/20260725210000_author_commercial_applications.sql",
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
