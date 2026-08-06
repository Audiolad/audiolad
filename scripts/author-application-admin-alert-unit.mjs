#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  summarizeAuthorApplicationAttention,
} from "../src/lib/admin/author-application-attention.ts";
import {
  AUTHOR_APPLICATION_SUBMITTED_ADMIN_MESSAGE_TYPE,
  buildAuthorApplicationSubmittedAdminDedupKey,
  resolveOperationalEmailDeliverySendIntent,
} from "../src/lib/email/operational-deliveries.ts";
import {
  AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_KEY,
  AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
  renderAuthorApplicationAdminAlertEmailHtml,
  renderAuthorApplicationAdminAlertEmailText,
} from "../src/lib/email/templates/author-application-admin-alert.ts";
import { brandEmailTemplateRenderer } from "../src/lib/email/templates/renderer.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function testAttentionSummary() {
  const summary = summarizeAuthorApplicationAttention([
    "submitted",
    "needs_changes",
    "in_review",
    "submitted",
    "approved",
  ]);

  assert.deepEqual(summary, {
    newCount: 2,
    attentionCount: 3,
    submitted: 2,
    needsChanges: 1,
  });
  assert.deepEqual(summarizeAuthorApplicationAttention([]), {
    newCount: 0,
    attentionCount: 0,
    submitted: 0,
    needsChanges: 0,
  });
}

function testDedupBySubmissionAttempt() {
  const applicationId = "fc11e971-4d49-4253-8dac-bc7e15415d42";
  const firstAttempt = "2026-07-30T10:00:00.000Z";
  const repeatedAttempt = "2026-07-31T10:00:00.000Z";

  assert.equal(
    buildAuthorApplicationSubmittedAdminDedupKey(applicationId, firstAttempt),
    `author-application:${applicationId}:submitted:${firstAttempt}:admin`,
  );
  assert.notEqual(
    buildAuthorApplicationSubmittedAdminDedupKey(applicationId, firstAttempt),
    buildAuthorApplicationSubmittedAdminDedupKey(applicationId, repeatedAttempt),
  );
  assert.equal(
    AUTHOR_APPLICATION_SUBMITTED_ADMIN_MESSAGE_TYPE,
    "author_application_submitted_admin",
  );
  assert.deepEqual(
    resolveOperationalEmailDeliverySendIntent({ status: "sent" }, false),
    { kind: "skip", reason: "already_sent" },
  );
  assert.deepEqual(
    resolveOperationalEmailDeliverySendIntent({ status: "failed" }, false),
    { kind: "send", mode: "retry" },
  );
}

async function testAdminAlertTemplate() {
  const input = {
    applicationId: "fc11e971-4d49-4253-8dac-bc7e15415d42",
    displayName: "Анна <Автор>",
    contactEmail: "anna@example.ru",
    contactDetails: "@anna",
    direction: "Медитации",
    submittedAtLabel: "30 июл. 2026 г., 13:00",
    siteOrigin: "https://audiolad.ru",
  };
  const html = renderAuthorApplicationAdminAlertEmailHtml(input);
  const text = renderAuthorApplicationAdminAlertEmailText(input);

  assert.match(html, /Новая заявка на авторство/);
  assert.match(html, /Анна &lt;Автор&gt;/);
  assert.match(html, /anna@example\.ru/);
  assert.match(html, /Медитации/);
  assert.match(html, /30 июл\. 2026 г\., 13:00/);
  const detailUrl =
    "https://audiolad.ru/admin/author-applications/fc11e971-4d49-4253-8dac-bc7e15415d42";
  assert.match(html, new RegExp(`href="${detailUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(html, />Открыть заявку</);
  assert.match(html, /Если кнопка не работает, откройте ссылку:/);
  assert.doesNotMatch(html, /href="Открыть заявку"/);
  assert.doesNotMatch(html, /href="#"/);
  assert.doesNotMatch(html, /href="\/admin\//);
  assert.doesNotMatch(html, /mail\.timeweb\.com/);
  for (const match of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi)) {
    assert.doesNotMatch(match[1], /<a\b/i, "nested <a> tags are forbidden");
  }
  assert.match(text, /Контакты: anna@example\.ru; @anna/);
  assert.match(text, new RegExp(detailUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(
    AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
    "author-application-admin-alert-v2-20260804",
  );

  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_KEY,
    templateVersion: AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
    payload: input,
  });
  assert.equal(rendered.ok, true);
}

function testWiringAndFilters() {
  const action = read("src/app/(platform)/become-author/actions.ts");
  assert.match(action, /sendAuthorApplicationAdminAlertEmail\(/);
  assert.match(action, /\.select\("id, submitted_at"\)/);
  assert.match(action, /\.eq\("status", existing\.status\)/);
  assert.match(action, /submittedAt: submittedApplication\.submitted_at/);
  assert.match(action, /author_application_admin_alert_email_failed/);
  assert.match(action, /revalidatePath\("\/admin"\)/);
  assert.match(action, /revalidatePath\("\/admin\/author-applications"\)/);
  assert.doesNotMatch(
    action,
    /sendAuthorApplicationAdminAlertEmail[\s\S]*throw/,
  );

  const sender = read(
    "src/lib/email/send-author-application-admin-alert-email.ts",
  );
  assert.match(sender, /authors@audiolad\.ru/);
  assert.match(sender, /acquireOperationalEmailDelivery/);
  assert.match(sender, /markOperationalEmailDeliverySent/);
  assert.match(sender, /markOperationalEmailDeliveryFailed/);

  const listPage = read("src/app/(platform)/admin/author-applications/page.tsx");
  assert.match(listPage, /AUTHOR_APPLICATION_ATTENTION_FILTER_KEY/);
  assert.match(listPage, /resolveAdminAuthorApplicationFilterStatuses/);

  const dashboard = read("src/app/(platform)/admin/page.tsx");
  assert.match(dashboard, /AuthorApplicationsAttentionCard/);

  const attentionCard = read(
    "src/components/admin/AuthorApplicationsAttentionCard.tsx",
  );
  assert.match(attentionCard, /status=attention/);
  assert.match(attentionCard, /status=new/);

  const layout = read("src/app/(platform)/admin/layout.tsx");
  assert.match(layout, /authorApplicationAttentionCount/);
  assert.match(layout, /author-applications/);
}

async function main() {
  testAttentionSummary();
  testDedupBySubmissionAttempt();
  await testAdminAlertTemplate();
  testWiringAndFilters();
  console.log("author-application-admin-alert-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
