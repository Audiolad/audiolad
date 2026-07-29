#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getHelpSearchIndex,
  listHelpArticles,
  validateHelpRegistry,
} from "../src/lib/help/registry.ts";
import {
  searchHelpArticles,
  tokenizeHelpSearchText,
} from "../src/lib/help/search.ts";
import { sanitizeSupportSourceUrl } from "../src/lib/help/source-url.ts";
import {
  validateSupportFormInput,
} from "../src/lib/help/support-validation.ts";
import { PLATFORM_ANALYTICS_EVENTS } from "../src/lib/analytics/constants.ts";
import { checkAnalyticsRateLimit } from "../src/lib/analytics/sanitize.ts";
import {
  isAllowedSupportRequestOrigin,
  getSupportRateLimitKey,
} from "../src/lib/help/request-guard.ts";
import { resolveSupportNotificationEmail } from "../src/lib/email/send-support-request-notification-email.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

console.log("help-center-support-unit: start");

const registry = validateHelpRegistry();
assert.equal(registry.ok, true, registry.errors.join(", "));
const articles = listHelpArticles();
assert.ok(articles.length >= 10, "expected at least 10 help articles");

const ids = new Set(articles.map((a) => a.id));
const slugs = new Set(articles.map((a) => `${a.category}/${a.slug}`));
assert.equal(ids.size, articles.length, "article ids must be unique");
assert.equal(slugs.size, articles.length, "category/slug must be unique");

for (const article of articles) {
  for (const relatedId of article.relatedArticleIds) {
    assert.ok(ids.has(relatedId), `missing related ${relatedId}`);
  }
  assert.ok(article.sections.length > 0, `${article.id} needs sections`);
  assert.ok(article.keywords.length > 0, `${article.id} needs keywords`);
}

const index = getHelpSearchIndex();
assert.equal(index.length, articles.length);

const titleHits = searchHelpArticles(index, "создать первый аудиопродукт");
assert.ok(titleHits.length > 0, "title search should hit");
assert.equal(titleHits[0].articleId, "help.authors.create-first-product");

const keywordHits = searchHelpArticles(index, "выплаты");
assert.ok(
  keywordHits.some((hit) => hit.articleId === "help.finance.earnings-and-payouts"),
  "keyword search should find earnings article",
);

const synonymHits = searchHelpArticles(index, "не пришло письмо");
assert.ok(
  synonymHits.some(
    (hit) => hit.articleId === "help.troubleshooting.email-not-received",
  ),
  "synonym search should find email troubleshooting",
);

assert.deepEqual(searchHelpArticles(index, "zzzz-no-such-help-article"), []);
assert.ok(tokenizeHelpSearchText("Ёлка, тест!").includes("елка"));

assert.equal(
  sanitizeSupportSourceUrl("https://audiolad.ru/d/secret-token-value"),
  "/d/[token]",
);
assert.equal(
  sanitizeSupportSourceUrl("https://audiolad.ru/help/authors?access_token=abc"),
  "/help/authors",
);
assert.equal(
  sanitizeSupportSourceUrl("/api/d/abc123/pdf/open"),
  "/api/d/[token]",
);
assert.equal(
  sanitizeSupportSourceUrl("https://evil.example/steal?x=1"),
  "/steal",
);
assert.equal(sanitizeSupportSourceUrl("javascript:alert(1)"), null);
assert.equal(sanitizeSupportSourceUrl(""), null);

const valid = validateSupportFormInput({
  category: "account",
  subject: "Не могу войти",
  message: "Письмо не приходит уже несколько часов.",
  contactName: "Анна",
  contactEmail: "Anna@Example.COM",
});
assert.equal(valid.ok, true);
if (valid.ok) {
  assert.equal(valid.value.contactEmail, "Anna@example.com");
}

assert.equal(
  validateSupportFormInput({
    category: "hack",
    subject: "Тема",
    message: "Достаточно длинное сообщение",
    contactName: "",
    contactEmail: "a@b.co",
  }).ok,
  false,
);

assert.equal(
  validateSupportFormInput({
    category: "other",
    subject: "Тема",
    message: "<script>alert(1)</script>",
    contactName: "",
    contactEmail: "a@b.co",
  }).ok,
  false,
);

assert.equal(
  validateSupportFormInput({
    category: "other",
    subject: "Тема\nBcc: evil@x.com",
    message: "Достаточно длинное сообщение",
    contactName: "",
    contactEmail: "a@b.co",
  }).ok,
  false,
);

const rateKey = getSupportRateLimitKey(
  new Request("https://audiolad.ru/api/help/support", {
    headers: { "x-forwarded-for": "203.0.113.10" },
  }),
  "user@example.com",
);
for (let i = 0; i < 5; i += 1) {
  assert.equal(checkAnalyticsRateLimit(rateKey, 5, 60_000), true);
}
assert.equal(checkAnalyticsRateLimit(rateKey, 5, 60_000), false);

assert.equal(
  isAllowedSupportRequestOrigin(
    new Request("https://audiolad.ru/api/help/support", {
      headers: { "sec-fetch-site": "cross-site" },
    }),
  ),
  false,
);
assert.equal(
  isAllowedSupportRequestOrigin(
    new Request("https://audiolad.ru/api/help/support", {
      headers: { "sec-fetch-site": "same-origin" },
    }),
  ),
  true,
);

const createSupportSource = read("src/lib/help/create-support-request.ts");
assert.match(
  createSupportSource,
  /sendSupportRequestNotificationEmail/,
  "email after insert",
);
assert.match(
  createSupportSource,
  /emailDelivered: emailResult\.ok/,
  "SMTP failure must not fail create result",
);
assert.doesNotMatch(
  createSupportSource,
  /delete\(|\.delete\(/,
  "no delete/retry insert on email failure",
);

const apiSource = read("src/app/api/help/support/route.ts");
assert.match(apiSource, /createServiceRoleClient/);
assert.match(apiSource, /rate_limited/);
assert.match(apiSource, /isAllowedSupportRequestOrigin/);
assert.match(apiSource, /validateSupportFormInput/);

const analyticsSource = read("src/lib/help/analytics.ts");
assert.doesNotMatch(analyticsSource, /contact_email/);
assert.doesNotMatch(analyticsSource, /properties:\s*\{[^}]*query\s*:/);
assert.match(analyticsSource, /query_length/);
assert.match(analyticsSource, /article_id/);
assert.match(analyticsSource, /Never attach free-text query/);

for (const eventName of [
  "help_article_view",
  "help_search",
  "help_search_no_results",
  "help_support_open",
  "help_support_submit",
  "help_article_cta_click",
]) {
  assert.ok(
    PLATFORM_ANALYTICS_EVENTS.includes(eventName),
    `missing analytics event ${eventName}`,
  );
}

const migration = read(
  "supabase/migrations/20260729180000_support_requests.sql",
);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.support_requests/);
assert.match(migration, /REVOKE ALL ON TABLE public\.support_requests FROM anon/);
assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.support_requests TO service_role/);

const analyticsMigration = read(
  "supabase/migrations/20260729181000_help_center_analytics_events.sql",
);
assert.match(analyticsMigration, /help_support_submit/);
assert.match(analyticsMigration, /author_page_view/);

assert.equal(resolveSupportNotificationEmail(), "1@audiolad.ru");

const settings = read("src/app/settings/page.tsx");
assert.match(settings, /href: "\/help"/);

const footer = read("src/lib/navigation/public-footer-links.ts");
assert.match(footer, /href: "\/help"/);

const opportunities = read(
  "src/components/author-dashboard/AuthorOpportunitiesClient.tsx",
);
assert.match(opportunities, /Справочный центр/);

const privacy = read("src/app/privacy/page.tsx");
assert.match(privacy, /текст обращения в поддержку/);

console.log("help-center-support-unit: ok");
