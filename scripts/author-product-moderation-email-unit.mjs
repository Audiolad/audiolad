#!/usr/bin/env node
/**
 * Unit tests for the author product moderation email templates, context
 * validation, worker processor, and the enqueue migration's source contract.
 * No database connection required — see
 * scripts/author-product-moderation-email-sql-unit.mjs for the isolated SQL
 * rehearsal.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHOR_PRODUCT_MODERATION_APPROVED_EMAIL_SUBJECT,
  renderAuthorProductModerationApprovedEmailHtml,
  renderAuthorProductModerationApprovedEmailText,
} from "../src/lib/email/templates/author-product-moderation-approved.ts";
import {
  AUTHOR_PRODUCT_MODERATION_CHANGES_REQUESTED_EMAIL_SUBJECT,
  renderAuthorProductModerationChangesRequestedEmailHtml,
  renderAuthorProductModerationChangesRequestedEmailText,
} from "../src/lib/email/templates/author-product-moderation-changes-requested.ts";
import {
  isAuthorProductModerationEmailContext,
  isAuthorProductModerationOutboxAction,
  resolveAuthorProductModerationAbsoluteUrl,
} from "../src/lib/email/author-product-moderation-context.ts";
import { buildAuthorProductModerationMessageId } from "../src/lib/email/notify-author-product-moderation.ts";
import { processAuthorProductModerationEmailOutbox } from "../src/lib/email/process-author-product-moderation-email-outbox.ts";
import {
  brandEmailTemplateRenderer,
  getBrandEmailTemplateVersion,
} from "../src/lib/email/templates/renderer.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

// ---------------------------------------------------------------------------
// Subjects — exact strict-contract strings.
// ---------------------------------------------------------------------------

assert.equal(
  AUTHOR_PRODUCT_MODERATION_CHANGES_REQUESTED_EMAIL_SUBJECT,
  "Требуются изменения в продукте – АудиоЛад",
);
assert.equal(
  AUTHOR_PRODUCT_MODERATION_APPROVED_EMAIL_SUBJECT,
  "Ваш продукт опубликован – АудиоЛад",
);

// ---------------------------------------------------------------------------
// URL helper
// ---------------------------------------------------------------------------

assert.equal(
  resolveAuthorProductModerationAbsoluteUrl("https://audiolad.ru", "/foo"),
  "https://audiolad.ru/foo",
);
assert.equal(
  resolveAuthorProductModerationAbsoluteUrl("https://audiolad.ru/", "/foo"),
  "https://audiolad.ru/foo",
);

// ---------------------------------------------------------------------------
// changes_requested template: full comment escaped in HTML, full text in
// plain, product explicitly described as not yet published, CTA present.
// ---------------------------------------------------------------------------

const xssComment =
  'Замените обложку <script>alert(1)</script> и добавьте описание.\nВторая строка с "кавычками".';

const changesHtml = renderAuthorProductModerationChangesRequestedEmailHtml({
  authorName: "Мария",
  productTitle: "Дыхательная практика <b>Утро</b>",
  moderatorComment: xssComment,
  authorDashboardPath: "/author-dashboard/products/practice-1?author=maria",
  siteOrigin: "https://audiolad.ru",
});

assert.ok(!changesHtml.includes("<script>alert(1)</script>"), "raw script tag must never appear in HTML");
assert.ok(changesHtml.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "comment must be HTML-escaped");
assert.ok(changesHtml.includes("&quot;кавычками&quot;"), "quotes in comment must be escaped");
assert.ok(changesHtml.includes("<br />"), "newlines in comment become <br /> in HTML");
assert.ok(!changesHtml.includes("<b>Утро</b>"), "product title must be escaped, not raw HTML");
assert.ok(changesHtml.includes("&lt;b&gt;Утро&lt;/b&gt;"), "escaped product title must render");
assert.ok(
  changesHtml.includes("не опубликован") || changesHtml.includes("НЕ опубликован"),
  "must explicitly state the product is not published yet",
);
assert.ok(
  changesHtml.includes(
    'href="https://audiolad.ru/author-dashboard/products/practice-1?author=maria"',
  ),
  "CTA must link to the author dashboard product edit path",
);
assert.ok(changesHtml.includes(">Внести изменения<"), "CTA label must be exactly 'Внести изменения'");

const changesText = renderAuthorProductModerationChangesRequestedEmailText({
  authorName: "Мария",
  productTitle: "Дыхательная практика",
  moderatorComment: xssComment,
  authorDashboardPath: "/author-dashboard/products/practice-1?author=maria",
  siteOrigin: "https://audiolad.ru",
});
assert.ok(changesText.includes(xssComment), "plain text must include the full, unescaped moderator comment");
assert.ok(
  changesText.includes("https://audiolad.ru/author-dashboard/products/practice-1?author=maria"),
  "plain text must include the dashboard CTA URL",
);

// ---------------------------------------------------------------------------
// approved template: CTA to public product path, falls back to dashboard
// path only when the public path snapshot is missing.
// ---------------------------------------------------------------------------

const approvedHtml = renderAuthorProductModerationApprovedEmailHtml({
  authorName: "Мария",
  productTitle: "Дыхательная практика",
  authorDashboardPath: "/author-dashboard/products/practice-1?author=maria",
  publicProductPath: "/practice/maria/dyhatelnaya-praktika",
  siteOrigin: "https://audiolad.ru",
});
assert.ok(
  approvedHtml.includes('href="https://audiolad.ru/practice/maria/dyhatelnaya-praktika"'),
  "approved CTA must link to the public product page when available",
);
assert.ok(approvedHtml.includes(">Открыть продукт<"), "CTA label must be exactly 'Открыть продукт'");

const approvedHtmlFallback = renderAuthorProductModerationApprovedEmailHtml({
  productTitle: "Дыхательная практика",
  authorDashboardPath: "/author-dashboard/products/practice-1?author=maria",
  publicProductPath: null,
  siteOrigin: "https://audiolad.ru",
});
assert.ok(
  approvedHtmlFallback.includes(
    'href="https://audiolad.ru/author-dashboard/products/practice-1?author=maria"',
  ),
  "approved CTA falls back to the dashboard path when public path snapshot is missing",
);

const approvedText = renderAuthorProductModerationApprovedEmailText({
  productTitle: "Дыхательная практика",
  authorDashboardPath: "/author-dashboard/products/practice-1?author=maria",
  publicProductPath: "/practice/maria/dyhatelnaya-praktika",
  siteOrigin: "https://audiolad.ru",
});
assert.ok(approvedText.includes("https://audiolad.ru/practice/maria/dyhatelnaya-praktika"));

// ---------------------------------------------------------------------------
// Renderer registration (two templates only)
// ---------------------------------------------------------------------------

const changesRenderResult = await brandEmailTemplateRenderer.render({
  templateKey: "author_product_moderation_changes_requested",
  templateVersion: "irrelevant",
  payload: {
    productTitle: "Продукт",
    moderatorComment: "Комментарий",
    authorDashboardPath: "/author-dashboard/products/1?author=a",
  },
});
assert.ok(changesRenderResult.ok, "renderer must render changes_requested template");
assert.equal(changesRenderResult.subject, AUTHOR_PRODUCT_MODERATION_CHANGES_REQUESTED_EMAIL_SUBJECT);

const approvedRenderResult = await brandEmailTemplateRenderer.render({
  templateKey: "author_product_moderation_approved",
  templateVersion: "irrelevant",
  payload: {
    productTitle: "Продукт",
    authorDashboardPath: "/author-dashboard/products/1?author=a",
  },
});
assert.ok(approvedRenderResult.ok, "renderer must render approved template");
assert.equal(approvedRenderResult.subject, AUTHOR_PRODUCT_MODERATION_APPROVED_EMAIL_SUBJECT);

const invalidPayloadResult = await brandEmailTemplateRenderer.render({
  templateKey: "author_product_moderation_changes_requested",
  templateVersion: "irrelevant",
  payload: {},
});
assert.deepEqual(invalidPayloadResult, { ok: false, code: "invalid_payload" });

assert.ok(
  getBrandEmailTemplateVersion("author_product_moderation_changes_requested"),
);
assert.ok(getBrandEmailTemplateVersion("author_product_moderation_approved"));

// ---------------------------------------------------------------------------
// Context validation helpers
// ---------------------------------------------------------------------------

assert.ok(isAuthorProductModerationOutboxAction("changes_requested"));
assert.ok(isAuthorProductModerationOutboxAction("approved_and_published"));
assert.ok(!isAuthorProductModerationOutboxAction("submitted"));
assert.ok(!isAuthorProductModerationOutboxAction("deleted"));

assert.ok(
  isAuthorProductModerationEmailContext({
    product_title: "Продукт",
    author_dashboard_path: "/author-dashboard/products/1?author=a",
    public_product_path: "/practice/a/b",
    moderator_comment: "Комментарий",
  }),
);
assert.ok(
  isAuthorProductModerationEmailContext({
    product_title: null,
    author_dashboard_path: "/author-dashboard/products/1?author=a",
    public_product_path: null,
    moderator_comment: null,
  }),
);
assert.ok(!isAuthorProductModerationEmailContext({}));
assert.ok(!isAuthorProductModerationEmailContext(null));
assert.ok(
  !isAuthorProductModerationEmailContext({
    product_title: "Продукт",
    author_dashboard_path: "",
    public_product_path: null,
    moderator_comment: null,
  }),
);

// ---------------------------------------------------------------------------
// Message-ID
// ---------------------------------------------------------------------------

assert.equal(
  buildAuthorProductModerationMessageId("11111111-1111-1111-1111-111111111111"),
  "<moderation-11111111-1111-1111-1111-111111111111@audiolad.ru>",
);

// ---------------------------------------------------------------------------
// Worker processor (mock RPC client, mirrors author-sale-email-outbox-unit)
// ---------------------------------------------------------------------------

const changesRow = {
  event_id: "event-1",
  action: "changes_requested",
  recipient_email: "owner@example.test",
  claim_token: "lease-1",
  context: {
    product_title: "Продукт",
    author_dashboard_path: "/author-dashboard/products/1?author=a",
    public_product_path: null,
    moderator_comment: "Поправьте обложку.",
  },
};

function makeClient(claimedRows) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "claim_practice_moderation_email_outbox") {
        return { data: claimedRows, error: null };
      }
      return { data: true, error: null };
    },
  };
}

{
  const client = makeClient([changesRow]);
  const result = await processAuthorProductModerationEmailOutbox({
    supabase: client,
    send: async () => ({ ok: true }),
  });
  assert.deepEqual(result, { claimed: 1, sent: 1, failed: 0 });
  const completeCall = client.calls.at(-1);
  assert.equal(completeCall.fn, "complete_practice_moderation_email_outbox");
  assert.equal(completeCall.args.p_outcome, "sent");
}

{
  const client = makeClient([changesRow]);
  const result = await processAuthorProductModerationEmailOutbox({
    supabase: client,
    send: async () => ({ ok: false, code: "send_failed" }),
  });
  assert.deepEqual(result, { claimed: 1, sent: 0, failed: 1 });
  const completeCall = client.calls.at(-1);
  assert.equal(completeCall.fn, "complete_practice_moderation_email_outbox");
  assert.equal(completeCall.args.p_outcome, "failed");
  assert.equal(completeCall.args.p_error_code, "send_failed");
}

{
  const invalidRow = { ...changesRow, recipient_email: null };
  const client = makeClient([invalidRow]);
  const result = await processAuthorProductModerationEmailOutbox({
    supabase: client,
    send: async () => {
      throw new Error("must_not_send_when_recipient_missing");
    },
  });
  assert.deepEqual(result, { claimed: 1, sent: 0, failed: 1 });
  assert.equal(client.calls.at(-1).args.p_error_code, "invalid_outbox_row");
}

{
  const client = makeClient([]);
  const result = await processAuthorProductModerationEmailOutbox({
    supabase: client,
    send: async () => {
      throw new Error("must_not_send_on_empty_claim");
    },
  });
  assert.deepEqual(result, { claimed: 0, sent: 0, failed: 0 });
}

{
  // Crash-window: complete() returns false because the lease was lost —
  // caller must surface this loudly instead of silently dropping the mail.
  const client = makeClient([changesRow]);
  client.rpc = async (fn, args) => {
    client.calls.push({ fn, args });
    if (fn === "claim_practice_moderation_email_outbox") {
      return { data: [changesRow], error: null };
    }
    if (fn === "complete_practice_moderation_email_outbox" && args.p_outcome === "sent") {
      return { data: false, error: null };
    }
    return { data: true, error: null };
  };
  await assert.rejects(
    processAuthorProductModerationEmailOutbox({
      supabase: client,
      send: async () => ({ ok: true }),
    }),
    /practice_moderation_email_outbox_complete_failed/,
  );
}

// ---------------------------------------------------------------------------
// Source contract: the new migration only, existing moderation migrations
// must remain untouched (verified independently by the pre-existing
// admin-product-moderation-unit.mjs / author-product-moderation-*-unit.mjs
// guards, which assert those files still do not mention this outbox).
// ---------------------------------------------------------------------------

const migration = read(
  "supabase/migrations/20260801140000_practice_moderation_email_outbox.sql",
);

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.practice_moderation_email_outbox/);
assert.match(
  migration,
  /REFERENCES public\.practice_moderation_events \(id\) ON DELETE RESTRICT/,
);
assert.match(
  migration,
  /CHECK \(action IN \('changes_requested', 'approved_and_published'\)\)/,
);
assert.match(
  migration,
  /'pending', 'processing', 'retryable', 'sent', 'failed_permanent', 'cancelled'/,
);
assert.match(migration, /CHECK \(recipient_role = 'author_owner'\)/);
assert.match(migration, /am\.role = 'owner'/);
assert.doesNotMatch(migration, /am\.role = 'editor'/);
assert.match(migration, /REVOKE ALL ON TABLE public\.practice_moderation_email_outbox FROM PUBLIC/);
assert.match(
  migration,
  /REVOKE ALL ON TABLE public\.practice_moderation_email_outbox FROM anon, authenticated/,
);
assert.match(
  migration,
  /GRANT SELECT, INSERT, UPDATE ON TABLE public\.practice_moderation_email_outbox TO service_role/,
);
assert.match(migration, /FUNCTION public\.moderation_email_delivery_is_stale/);
assert.match(migration, /FUNCTION public\.claim_practice_moderation_email_outbox/);
assert.match(migration, /FUNCTION public\.complete_practice_moderation_email_outbox/);
assert.match(migration, /FOR UPDATE SKIP LOCKED/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.log_practice_moderation_event/);

// Strict scope: only the two in-scope actions ever enqueue mail.
assert.match(
  migration,
  /IF p_action IN \('changes_requested', 'approved_and_published'\) THEN/,
);
// No admin-facing alert email is introduced by this migration.
assert.doesNotMatch(migration, /admin_alert/);
assert.doesNotMatch(migration, /admin_email/);

console.log("author-product-moderation-email-unit: ok");
