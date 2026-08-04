#!/usr/bin/env node
/**
 * HTML CTA contract for administrative emails (author application,
 * commercial application, product moderation submit/resubmit).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
  renderAuthorApplicationAdminAlertEmailHtml,
  renderAuthorApplicationAdminAlertEmailText,
} from "../src/lib/email/templates/author-application-admin-alert.ts";
import {
  AUTHOR_PRODUCT_MODERATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
  buildAuthorProductModerationAdminAlertSubject,
  getAuthorProductModerationAdminDetailUrl,
  renderAuthorProductModerationAdminAlertEmailHtml,
  renderAuthorProductModerationAdminAlertEmailText,
} from "../src/lib/email/templates/author-product-moderation-admin-alert.ts";
import {
  COMMERCIAL_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
  renderCommercialApplicationAdminAlertEmailHtml,
  renderCommercialApplicationAdminAlertEmailText,
} from "../src/lib/email/templates/commercial-application-admin-alert.ts";
import {
  isAuthorProductModerationAdminEmailContext,
  isAuthorProductModerationAdminOutboxAction,
  isAuthorProductModerationOutboxAction,
} from "../src/lib/email/author-product-moderation-context.ts";
import { processAuthorProductModerationEmailOutbox } from "../src/lib/email/process-author-product-moderation-email-outbox.ts";
import { renderBrandEmailButton } from "../src/lib/email/templates/brand-layout.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function assertSafeAdminCta(html, text, absoluteUrl, label) {
  const escaped = absoluteUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(html, new RegExp(`href="${escaped}"`));
  assert.match(html, new RegExp(`>${label}<`));
  assert.match(html, /Если кнопка не работает, откройте ссылку:/);
  assert.match(html, new RegExp(`>${escaped}<`));
  assert.doesNotMatch(html, new RegExp(`href="${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.doesNotMatch(html, /href="#"/);
  assert.doesNotMatch(html, /href="\/admin\//);
  assert.doesNotMatch(html, /mail\.timeweb\.com/);
  assert.doesNotMatch(html, /onclick=/i);
  assert.doesNotMatch(html, /<button[\s>]/i);
  assert.match(text, new RegExp(escaped));
  // Sibling CTAs are fine; nested anchors (an <a> containing another <a>) are not.
  const anchorBodies = html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi);
  for (const match of anchorBodies) {
    assert.doesNotMatch(
      match[1],
      /<a\b/i,
      "nested <a> tags are forbidden in email HTML",
    );
  }
}

assert.throws(
  () => renderBrandEmailButton("Открыть заявку", "https://audiolad.ru/admin"),
  /brand_email_button_requires_absolute_http_url/,
);

{
  const applicationId = "fc11e971-4d49-4253-8dac-bc7e15415d42";
  const input = {
    applicationId,
    displayName: "Анна",
    contactEmail: "anna@example.ru",
    contactDetails: "",
    direction: "Медитации",
    submittedAtLabel: "4 авг. 2026 г., 10:00",
    siteOrigin: "https://audiolad.ru",
  };
  const url = `https://audiolad.ru/admin/author-applications/${applicationId}`;
  assertSafeAdminCta(
    renderAuthorApplicationAdminAlertEmailHtml(input),
    renderAuthorApplicationAdminAlertEmailText(input),
    url,
    "Открыть заявку",
  );
  assert.equal(
    AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
    "author-application-admin-alert-v2-20260804",
  );
}

{
  const applicationId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const input = {
    authorName: "Герман",
    applicationId,
    kind: "submitted",
    siteOrigin: "https://audiolad.ru",
  };
  const url = `https://audiolad.ru/admin/commercial-applications/${applicationId}`;
  assertSafeAdminCta(
    renderCommercialApplicationAdminAlertEmailHtml(input),
    renderCommercialApplicationAdminAlertEmailText(input),
    url,
    "Рассмотреть заявку",
  );
  assert.equal(
    COMMERCIAL_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
    "commercial-application-admin-alert-v2-20260804",
  );
}

{
  const productId = "5fb00fbb-1111-2222-3333-444444444444";
  const submittedInput = {
    productId,
    productTitle: "Утренний цигун",
    authorName: "Ольга",
    authorProjectName: "Ольга",
    productKindLabel: "альбом",
    priceLabel: "бесплатный",
    audioTrackCount: 3,
    submissionKindLabel: "первая отправка",
    submittedAtLabel: "4 авг. 2026 г., 12:30",
    kind: "submitted",
    siteOrigin: "https://audiolad.ru",
  };
  const resubmittedInput = {
    ...submittedInput,
    kind: "resubmitted",
    submissionKindLabel: "повторная отправка",
  };
  const url = getAuthorProductModerationAdminDetailUrl(
    productId,
    "https://audiolad.ru",
  );
  assert.equal(url, `https://audiolad.ru/admin/product-moderation/${productId}`);
  assert.equal(
    buildAuthorProductModerationAdminAlertSubject("Утренний цигун", "submitted"),
    "Новый продукт на модерации — Утренний цигун",
  );
  assert.equal(
    buildAuthorProductModerationAdminAlertSubject("Утренний цигун", "resubmitted"),
    "Продукт повторно отправлен на модерацию — Утренний цигун",
  );

  const submittedHtml = renderAuthorProductModerationAdminAlertEmailHtml(submittedInput);
  assert.match(submittedHtml, /Новый продукт отправлен на модерацию/);
  assert.match(submittedHtml, /отправил продукт на модерацию/);
  assertSafeAdminCta(
    submittedHtml,
    renderAuthorProductModerationAdminAlertEmailText(submittedInput),
    url,
    "Открыть модерацию",
  );

  const resubmittedHtml =
    renderAuthorProductModerationAdminAlertEmailHtml(resubmittedInput);
  assert.match(resubmittedHtml, /Продукт повторно отправлен на модерацию/);
  assert.match(resubmittedHtml, /повторно отправил продукт на модерацию/);
  assertSafeAdminCta(
    resubmittedHtml,
    renderAuthorProductModerationAdminAlertEmailText(resubmittedInput),
    url,
    "Открыть модерацию",
  );
  assert.equal(
    AUTHOR_PRODUCT_MODERATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
    "author-product-moderation-admin-alert-v1-20260804",
  );
}

assert.equal(isAuthorProductModerationAdminOutboxAction("submitted"), true);
assert.equal(isAuthorProductModerationAdminOutboxAction("resubmitted"), true);
assert.equal(isAuthorProductModerationOutboxAction("changes_requested"), true);
assert.equal(isAuthorProductModerationOutboxAction("draft"), false);
assert.equal(
  isAuthorProductModerationAdminEmailContext({
    product_id: "5fb00fbb-1111-2222-3333-444444444444",
    product_title: "Утро",
    author_name: "Ольга",
    author_project_name: "Ольга",
    product_kind_label: "альбом",
    price_label: "бесплатный",
    audio_track_count: 3,
    submission_kind_label: "первая отправка",
    submitted_at: "2026-08-04T09:30:00.000Z",
    admin_review_path: "/admin/product-moderation/5fb00fbb-1111-2222-3333-444444444444",
  }),
  true,
);

{
  const adminRow = {
    event_id: "event-admin-1",
    action: "submitted",
    recipient_email: "authors@audiolad.ru",
    claim_token: "lease-admin-1",
    context: {
      product_id: "5fb00fbb-1111-2222-3333-444444444444",
      product_title: "Утро",
      author_name: "Ольга",
      author_project_name: "Ольга",
      product_kind_label: "альбом",
      price_label: "бесплатный",
      audio_track_count: 3,
      submission_kind_label: "первая отправка",
      submitted_at: "2026-08-04T09:30:00.000Z",
      admin_review_path:
        "/admin/product-moderation/5fb00fbb-1111-2222-3333-444444444444",
    },
  };

  const calls = [];
  const client = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "claim_practice_moderation_email_outbox") {
        return { data: [adminRow], error: null };
      }
      return { data: true, error: null };
    },
  };

  let adminSendCount = 0;
  let authorSendCount = 0;
  const result = await processAuthorProductModerationEmailOutbox({
    supabase: client,
    send: async () => {
      authorSendCount += 1;
      return { ok: true };
    },
    sendAdmin: async (input) => {
      adminSendCount += 1;
      assert.equal(input.productId, adminRow.context.product_id);
      assert.equal(input.toEmail, "authors@audiolad.ru");
      assert.match(input.adminReviewPath, /\/admin\/product-moderation\//);
      return { ok: true };
    },
  });
  assert.deepEqual(result, { claimed: 1, sent: 1, failed: 0 });
  assert.equal(adminSendCount, 1);
  assert.equal(authorSendCount, 0);
}

{
  const migration = read(
    "supabase/migrations/20260804120000_practice_moderation_admin_email_outbox.sql",
  );
  assert.match(migration, /authors@audiolad\.ru/);
  assert.match(migration, /platform_admin/);
  assert.match(migration, /'submitted',\s*'resubmitted'/);
  assert.match(migration, /IF p_action IN \('submitted', 'resubmitted'\) THEN/);
  assert.match(migration, /\/admin\/product-moderation\//);
  assert.match(migration, /SET search_path = public, pg_temp/);
  assert.doesNotMatch(migration, /author@audiolad\.ru/);
}

console.log("admin-email-cta-unit: ok");
