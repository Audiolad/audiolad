#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getCommercialApplicationAttentionRank,
  sortAdminCommercialApplicationsByAttention,
  summarizeCommercialApplicationAttention,
} from "../src/lib/admin/commercial-application-attention.ts";
import {
  buildCommercialApplicationAdminAlertSubject,
  renderCommercialApplicationAdminAlertEmailHtml,
  renderCommercialApplicationAdminAlertEmailText,
} from "../src/lib/email/templates/commercial-application-admin-alert.ts";
import { brandEmailTemplateRenderer } from "../src/lib/email/templates/renderer.ts";
import { evaluateCommercialOnboardingChecklist } from "../src/lib/author-dashboard/commercial-onboarding.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function testAttentionSummaryAndSort() {
  const summary = summarizeCommercialApplicationAttention([
    "submitted",
    "approved",
    "needs_changes",
    "rejected",
    "in_review",
    "submitted",
  ]);

  assert.equal(summary.newCount, 2);
  assert.equal(summary.attentionCount, 4);
  assert.equal(summary.submitted, 2);
  assert.equal(summary.needsChanges, 1);
  assert.equal(summary.inReview, 1);

  assert.equal(getCommercialApplicationAttentionRank("submitted"), 0);
  assert.equal(getCommercialApplicationAttentionRank("approved"), 3);

  const sorted = sortAdminCommercialApplicationsByAttention([
    {
      id: "approved",
      status: "approved",
      submittedAt: "2026-07-26T12:00:00.000Z",
      createdAt: "2026-07-26T12:00:00.000Z",
    },
    {
      id: "old-submitted",
      status: "submitted",
      submittedAt: "2026-07-25T12:00:00.000Z",
      createdAt: "2026-07-25T12:00:00.000Z",
    },
    {
      id: "new-submitted",
      status: "submitted",
      submittedAt: "2026-07-26T15:00:00.000Z",
      createdAt: "2026-07-26T15:00:00.000Z",
    },
    {
      id: "needs",
      status: "needs_changes",
      submittedAt: "2026-07-26T14:00:00.000Z",
      createdAt: "2026-07-26T14:00:00.000Z",
    },
    {
      id: "review",
      status: "in_review",
      submittedAt: "2026-07-26T13:00:00.000Z",
      createdAt: "2026-07-26T13:00:00.000Z",
    },
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ["new-submitted", "old-submitted", "needs", "review", "approved"],
  );
}

function testSubmittedOnboardingHasNoDuplicateHint() {
  const submitted = evaluateCommercialOnboardingChecklist({
    authorSlug: "german-semenuk",
    accessStatus: "commercial_pending",
    freeGateReady: true,
    products: [],
    campaigns: [],
    applicationStatus: "submitted",
  });

  assert.equal(submitted.steps[0].statusLabel, "Заявка отправлена");
  assert.match(
    submitted.steps[0].description,
    /Мы получили заявку и сообщим о результате/,
  );
  assert.equal(submitted.steps[0].hint, null);
}

function testAdminAlertEmail() {
  const subject = buildCommercialApplicationAdminAlertSubject(
    "Герман Семенюк",
    "submitted",
  );
  assert.equal(
    subject,
    "Новая заявка на коммерческий статус – Герман Семенюк",
  );
  assert.equal(
    buildCommercialApplicationAdminAlertSubject("Герман Семенюк", "updated"),
    "Автор обновил коммерческую заявку – Герман Семенюк",
  );

  const html = renderCommercialApplicationAdminAlertEmailHtml({
    authorName: "Герман Семенюк",
    applicationId: "fc11e971-4d49-4253-8dac-bc7e15415d42",
    kind: "submitted",
    siteOrigin: "https://audiolad.ru",
  });
  assert.match(html, /Герман Семенюк/);
  assert.match(
    html,
    /\/admin\/commercial-applications\/fc11e971-4d49-4253-8dac-bc7e15415d42/,
  );
  assert.match(html, /Рассмотреть заявку/);
  assert.match(
    html,
    /href="https:\/\/audiolad\.ru\/admin\/commercial-applications\//,
  );
  assert.doesNotMatch(html, /href="Открыть заявку"/);
  assert.doesNotMatch(html, /href="Рассмотреть заявку"/);
  assert.doesNotMatch(html, /mail\.timeweb\.com/);

  const text = renderCommercialApplicationAdminAlertEmailText({
    authorName: "Герман Семенюк",
    applicationId: "fc11e971-4d49-4253-8dac-bc7e15415d42",
    kind: "updated",
    siteOrigin: "https://audiolad.ru",
  });
  assert.match(text, /обновил заявку/);
}

async function testRendererRegistration() {
  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: "commercial_application_admin_alert",
    templateVersion: "commercial-application-admin-alert-v2-20260804",
    payload: {
      authorName: "Герман Семенюк",
      applicationId: "fc11e971-4d49-4253-8dac-bc7e15415d42",
      kind: "submitted",
      siteOrigin: "https://audiolad.ru",
    },
  });

  assert.equal(rendered.ok, true);
  if (rendered.ok) {
    assert.match(rendered.subject, /Новая заявка на коммерческий статус/);
    assert.match(rendered.html, /административную панель/);
  }
}

function testSourceGuards() {
  const list = read("src/components/admin/CommercialApplicationsList.tsx");
  assert.match(list, /Открыть заявку/);
  assert.match(list, /plannedProducts/);
  assert.match(list, /Заявок пока нет/);
  assert.match(list, /getCommercialApplicationStatusLabel/);

  const page = read("src/app/admin/page.tsx");
  assert.match(page, /CommercialApplicationsAttentionCard/);
  assert.match(page, /getCachedAdminCommercialApplicationAttentionSummary/);

  const layout = read("src/app/admin/layout.tsx");
  assert.match(layout, /badgeCount/);
  assert.match(layout, /commercial-applications/);
  assert.match(layout, /getCachedAdminCommercialApplicationAttentionSummary/);

  const nav = read("src/components/admin/AdminNav.tsx");
  assert.match(nav, /badgeCount/);

  const route = read("src/app/api/author/commercial-application/route.ts");
  assert.match(route, /sendCommercialApplicationAdminAlertEmail/);
  assert.match(route, /previousStatus/);
  assert.match(route, /idempotent/);
  assert.doesNotMatch(route, /await notifyAdmin[\s\S]*throw/);

  const form = read(
    "src/components/author-dashboard/AuthorCommercialApplicationForm.tsx",
  );
  assert.match(form, /break-words/);

  const queries = read("src/lib/admin/commercial-application-queries.ts");
  assert.match(queries, /sortAdminCommercialApplicationsByAttention/);
  assert.match(queries, /planned_products/);
}

async function main() {
  testAttentionSummaryAndSort();
  testSubmittedOnboardingHasNoDuplicateHint();
  testAdminAlertEmail();
  await testRendererRegistration();
  testSourceGuards();
  console.log("admin-commercial-applications-visibility-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
