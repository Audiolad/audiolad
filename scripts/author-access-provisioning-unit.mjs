#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getAdminApplicationStatusLabel } from "../src/lib/admin/application-status.ts";
import { mapAuthorApplicationRpcError } from "../src/lib/admin/author-application-rpc.ts";
import {
  authorAccessAllowsContentMutations,
  authorAccessAllowsPaidProducts,
  getAuthorAccessBannerMessage,
  getAuthorAccessStatusLabel,
  getPaidPricingDisabledReason,
} from "../src/lib/authors/access.ts";
import {
  AUTHOR_APPLICATION_APPROVED_EMAIL_SUBJECT,
  getAuthorDashboardUrl,
  renderAuthorApplicationApprovedEmailHtml,
  renderAuthorApplicationApprovedEmailText,
} from "../src/lib/email/templates/author-application-approved.ts";
import { brandEmailTemplateRenderer } from "../src/lib/email/templates/renderer.ts";

function testSubmittedDisplayedAsNew() {
  assert.equal(getAdminApplicationStatusLabel("submitted"), "Новая");
}

function testWithdrawnDisplayedAsCancelled() {
  assert.equal(getAdminApplicationStatusLabel("withdrawn"), "Отменена");
}

function testAccessHelpers() {
  assert.equal(authorAccessAllowsPaidProducts("commercial"), true);
  assert.equal(authorAccessAllowsPaidProducts("free"), false);
  assert.equal(authorAccessAllowsPaidProducts("commercial_pending"), false);

  assert.equal(authorAccessAllowsContentMutations("free"), true);
  assert.equal(authorAccessAllowsContentMutations("suspended"), false);
  assert.equal(authorAccessAllowsContentMutations("terminated"), false);

  assert.match(
    getAuthorAccessBannerMessage("free") ?? "",
    /Бесплатный авторский аккаунт/,
  );
  assert.match(
    getAuthorAccessBannerMessage("suspended") ?? "",
    /приостановлен/i,
  );
  assert.match(
    getPaidPricingDisabledReason("free") ?? "",
    /коммерческого подключения/,
  );
  assert.equal(getPaidPricingDisabledReason("commercial"), null);
  assert.equal(
    getAuthorAccessStatusLabel("commercial_pending"),
    "Коммерческое подключение",
  );
}

function testApplicationColumnsIncludeProvisioningFields() {
  const columnsText = readFileSync(
    new URL("../src/lib/author-applications/queries.ts", import.meta.url),
    "utf8",
  );
  assert(columnsText.includes("author_id"), "author_id column selected");
  assert(columnsText.includes("approved_at"), "approved_at column selected");
  assert(columnsText.includes("approved_by"), "approved_by column selected");
}

function testEmailTemplate() {
  const html = renderAuthorApplicationApprovedEmailHtml({
    siteOrigin: "https://audiolad.ru",
  });
  const text = renderAuthorApplicationApprovedEmailText({
    siteOrigin: "https://audiolad.ru",
  });

  assert.equal(
    AUTHOR_APPLICATION_APPROVED_EMAIL_SUBJECT,
    "Поздравляем! Ваша заявка одобрена 🎉",
  );
  assert.match(html, /заявка.*одобрена/i);
  assert.match(html, /Открыть кабинет автора/);
  assert.match(html, /С чего начать/);
  assert.match(html, /https:\/\/audiolad\.ru\/author-dashboard/);
  assert.match(text, /https:\/\/audiolad\.ru\/author-dashboard/);
  assert.equal(
    getAuthorDashboardUrl("https://audiolad.ru"),
    "https://audiolad.ru/author-dashboard",
  );
}

async function testRendererRegistration() {
  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: "author_application_approved",
    templateVersion: "author-application-approved-v2-20260722",
    payload: {},
  });

  assert.equal(rendered.ok, true);
  if (rendered.ok) {
    assert.equal(rendered.subject, AUTHOR_APPLICATION_APPROVED_EMAIL_SUBJECT);
    assert.match(rendered.html, /author-dashboard/);
  }
}

function testRpcErrorMapping() {
  assert.match(mapAuthorApplicationRpcError("forbidden"), /прав/);
  assert.match(
    mapAuthorApplicationRpcError("paid_products_not_allowed"),
    /действие/,
  );
}

function testAuthorApplicationActionsModuleExportsOnlyAsyncFunctions() {
  const actionsSource = readFileSync(
    new URL("../src/app/admin/author-applications/actions.ts", import.meta.url),
    "utf8",
  );
  const formSource = readFileSync(
    new URL(
      "../src/components/admin/AuthorApplicationReviewForm.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const actionStateSource = readFileSync(
    new URL(
      "../src/app/admin/author-applications/action-state.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(actionsSource, /^"use server";/m);
  assert.doesNotMatch(actionsSource, /^export (const|type|enum|class|\{)/m);
  assert.match(
    actionsSource,
    /export async function approveAuthorApplication\(/,
  );
  assert.match(
    formSource,
    /ADMIN_AUTHOR_APPLICATION_ACTION_INITIAL_STATE/,
  );
  assert.match(formSource, /from "@\/app\/admin\/author-applications\/action-state"/);
  assert.match(formSource, /from "@\/app\/admin\/author-applications\/actions"/);
  assert.doesNotMatch(actionsSource, /export \{ INITIAL_STATE/);
  assert.match(
    actionStateSource,
    /export const ADMIN_AUTHOR_APPLICATION_ACTION_INITIAL_STATE/,
  );
}

async function main() {
  testSubmittedDisplayedAsNew();
  testWithdrawnDisplayedAsCancelled();
  testAccessHelpers();
  testApplicationColumnsIncludeProvisioningFields();
  testEmailTemplate();
  await testRendererRegistration();
  testRpcErrorMapping();
  testAuthorApplicationActionsModuleExportsOnlyAsyncFunctions();
  console.log("author-access-provisioning-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
