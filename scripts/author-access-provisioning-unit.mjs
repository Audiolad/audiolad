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
  AUTHOR_ACCESS_GRANTED_EMAIL_SUBJECT,
  getAuthorDashboardUrl,
  renderAuthorAccessGrantedEmailHtml,
  renderAuthorAccessGrantedEmailText,
} from "../src/lib/email/templates/author-access-granted.ts";
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
  const html = renderAuthorAccessGrantedEmailHtml({
    userName: "Анна Автор",
    siteOrigin: "https://audiolad.ru",
  });
  const text = renderAuthorAccessGrantedEmailText({
    userName: "Анна Автор",
    siteOrigin: "https://audiolad.ru",
  });

  assert.equal(
    AUTHOR_ACCESS_GRANTED_EMAIL_SUBJECT,
    "Вам открыт кабинет автора АудиоЛада",
  );
  assert.match(html, /заявка на авторство одобрена/i);
  assert.match(html, /бесплатный авторский аккаунт/i);
  assert.match(html, /коммерческого подключения/i);
  assert.match(html, /Перейти в кабинет автора/);
  assert.match(html, /https:\/\/audiolad\.ru\/author-dashboard/);
  assert.match(text, /https:\/\/audiolad\.ru\/author-dashboard/);
  assert.equal(
    getAuthorDashboardUrl("https://audiolad.ru"),
    "https://audiolad.ru/author-dashboard",
  );
}

async function testRendererRegistration() {
  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: "author_access_granted",
    templateVersion: "author-access-granted-v1-20260722",
    payload: { userName: "Анна" },
  });

  assert.equal(rendered.ok, true);
  if (rendered.ok) {
    assert.equal(rendered.subject, AUTHOR_ACCESS_GRANTED_EMAIL_SUBJECT);
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

async function main() {
  testSubmittedDisplayedAsNew();
  testWithdrawnDisplayedAsCancelled();
  testAccessHelpers();
  testApplicationColumnsIncludeProvisioningFields();
  testEmailTemplate();
  await testRendererRegistration();
  testRpcErrorMapping();
  console.log("author-access-provisioning-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
