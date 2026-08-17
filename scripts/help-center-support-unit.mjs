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
  findBareRoutesInProse,
  flattenHelpRichText,
  helpPublicLink,
  helpRich,
  isHelpRichNodes,
} from "../src/lib/help/rich-text.ts";
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
const helpHrefs = new Set(
  articles.map((article) => `/help/${article.category}/${article.slug}`),
);
assert.equal(ids.size, articles.length, "article ids must be unique");
assert.equal(slugs.size, articles.length, "category/slug must be unique");

const createFirstProduct = articles.find(
  (article) => article.id === "help.authors.create-first-product",
);
assert.ok(createFirstProduct, "create-first-product article remains registered");
assert.equal(createFirstProduct.slug, "create-first-product");
assert.match(
  createFirstProduct.title,
  /первый аудиопродукт/i,
  "create-first-product keeps product-creation title",
);

const languageFormatting = articles.find(
  (article) => article.id === "help.authors.language-and-formatting",
);
assert.ok(
  languageFormatting,
  "language-and-formatting article remains registered",
);
assert.equal(languageFormatting.slug, "language-and-formatting");
assert.equal(
  languageFormatting.title,
  "Язык и оформление материалов",
  "language article title matches cross-link labels",
);

for (const article of articles) {
  for (const relatedId of article.relatedArticleIds) {
    assert.ok(ids.has(relatedId), `missing related ${relatedId}`);
  }
  assert.ok(article.sections.length > 0, `${article.id} needs sections`);
  assert.ok(article.keywords.length > 0, `${article.id} needs keywords`);

  for (const section of article.sections) {
    const faqAnswers = (section.faq ?? []).map((item) => item.answer);
    for (const field of ["paragraphs", "steps", "notes", "faq"]) {
      const values = field === "faq" ? faqAnswers : section[field] ?? [];
      for (const value of values) {
        if (isHelpRichNodes(value)) {
          for (const node of value) {
            if (node.type === "link") {
              assert.ok(
                node.href.startsWith("/"),
                `${article.id} link href relative`,
              );
              assert.ok(
                node.label.trim().length > 0,
                `${article.id} link label must not be empty`,
              );

              const absoluteLabel = `https://audiolad.ru${node.href}`;
              const isHelpArticleLink = helpHrefs.has(node.href);
              const isKnownHelpPage =
                node.href === "/help" ||
                node.href === "/help/support" ||
                node.href.startsWith("/help/support?");

              if (isHelpArticleLink) {
                assert.ok(
                  node.label === absoluteLabel ||
                    !/^https?:\/\//i.test(node.label),
                  `${article.id} help article link label is titled text or absolute audiolad.ru URL`,
                );
                assert.ok(
                  !node.label.startsWith("/"),
                  `${article.id} titled help link must not use bare path as label`,
                );
              } else if (node.href.startsWith("/help/")) {
                assert.ok(
                  isKnownHelpPage,
                  `${article.id} unknown help href: ${node.href}`,
                );
                assert.equal(
                  node.label,
                  absoluteLabel,
                  `${article.id} help page link label must match absolute audiolad.ru URL`,
                );
              } else {
                assert.match(
                  node.label,
                  /^https:\/\/audiolad\.ru\//,
                  `${article.id} product/app link label must be absolute audiolad.ru URL`,
                );
                assert.equal(
                  node.label,
                  absoluteLabel,
                  `${article.id} product/app label must match href path`,
                );
              }
            }
          }
        } else {
          assert.deepEqual(
            findBareRoutesInProse(value),
            [],
            `${article.id} still has bare route in ${field}: ${value}`,
          );
        }
      }
    }
  }
}

const createFirstSource = read(
  "src/lib/help/articles/authors/create-first-product.ts",
);
assert.match(
  createFirstSource,
  /helpPublicLink\("\/author-dashboard\/products\/new"\)/,
  "create-first-product keeps absolute-label product route link",
);
assert.match(
  createFirstSource,
  /helpPublicLink\("\/help\/authors\/language-and-formatting"/,
  "create-first-product cross-links language article by slug",
);
assert.match(
  createFirstSource,
  /label: "«Язык и оформление материалов»"/,
  "create-first-product uses titled help cross-link label",
);

const richTextHelper = read("src/lib/help/rich-text.ts");
assert.match(
  richTextHelper,
  /options\?\.label \?\? `\$\{origin\}\$\{normalizedHref\}`/,
  "helpPublicLink defaults to absolute display label",
);

const sampleRich = helpRich(
  "Откройте ",
  helpPublicLink("/auth/sign-up"),
  ".",
);
assert.equal(
  flattenHelpRichText(sampleRich),
  "Откройте https://audiolad.ru/auth/sign-up.",
);
assert.deepEqual(findBareRoutesInProse("Откройте /auth/sign-up."), [
  "/auth/sign-up",
]);
assert.deepEqual(findBareRoutesInProse("Шаблон /d/{token} ок"), []);

const articleView = read("src/components/help/HelpArticleView.tsx");
assert.match(articleView, /HelpRichText/);
assert.doesNotMatch(
  articleView,
  /replace\(.*\/auth/,
  "no regex rewriting of routes in article view",
);
assert.match(articleView, /headingLevel === 3/);
assert.match(articleView, /section\.faq/);
assert.match(articleView, /figure\.src/);
assert.match(articleView, /article\.heading \?\? article\.title/);

const installOnPhone = articles.find(
  (article) => article.id === "help.listeners.install-on-phone",
);
assert.ok(installOnPhone, "install-on-phone article remains registered");
assert.equal(installOnPhone.slug, "install-on-phone");
assert.equal(installOnPhone.category, "getting-started");
assert.equal(
  installOnPhone.title,
  "Как скачать и установить АудиоЛад",
  "install card/breadcrumb title",
);
assert.equal(
  installOnPhone.heading,
  "Как скачать и установить АудиоЛад на телефон и компьютер",
);
assert.match(installOnPhone.seoTitle, /АудиоЛад скачать/);
assert.match(installOnPhone.seoTitle, /Виндовс/);
assert.match(installOnPhone.seoDescription, /Виндовс \("Windows"\)|Виндовс \(«Windows»\)/);
assert.equal(
  `/help/${installOnPhone.category}/${installOnPhone.slug}`,
  "/help/getting-started/install-on-phone",
);
assert.equal(
  articles.filter((article) => /скачать/i.test(article.slug)).length,
  0,
  "no extra download slug besides install-on-phone URL",
);

const {
  buildHelpArticleMetadata,
  helpArticleDocumentTitle,
} = await import("../src/lib/help/metadata.ts");
assert.equal(
  helpArticleDocumentTitle(installOnPhone),
  "АудиоЛад скачать на Виндовс, Андроид и Айфон — как установить",
);
const installMetadata = buildHelpArticleMetadata(installOnPhone);
assert.equal(
  installMetadata.title,
  "АудиоЛад скачать на Виндовс, Андроид и Айфон — как установить",
);
assert.equal(installMetadata.robots?.index, true);
assert.equal(installMetadata.robots?.follow, true);
assert.equal(
  installMetadata.alternates?.canonical,
  "https://audiolad.ru/help/getting-started/install-on-phone",
);

const { resolveHelpFigureSrc } = await import("../src/lib/help/figures.ts");
assert.equal(
  resolveHelpFigureSrc("/help/install-on-phone/android-chrome-open.png"),
  undefined,
  "missing illustration files must not resolve to a src",
);
assert.equal(resolveHelpFigureSrc("../secret.png"), undefined);
assert.equal(resolveHelpFigureSrc("//cdn.example/x.png"), undefined);

const index = getHelpSearchIndex();
assert.equal(index.length, articles.length);

for (const query of ["скачать", "установить", "виндовс", "андроид", "айфон", "приложение"]) {
  const hits = searchHelpArticles(index, query);
  assert.ok(
    hits.some((hit) => hit.articleId === "help.listeners.install-on-phone"),
    `help search "${query}" should find install-on-phone`,
  );
}

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

const settings = read("src/app/(platform)/settings/page.tsx");
assert.match(settings, /title: "Помощь и поддержка"/);
assert.match(settings, /href: "\/help"/);

const footer = read("src/lib/navigation/public-footer-links.ts");
assert.match(footer, /href: "\/help"/);
assert.match(footer, /title: "Помощь и поддержка"/);
assert.match(footer, /href: "\/philosophy"/);
assert.match(footer, /href: "\/for-authors"/);
const aboutFooterIndex = footer.indexOf('href: "/about"');
const philosophyFooterIndex = footer.indexOf('href: "/philosophy"');
const forAuthorsFooterIndex = footer.indexOf('href: "/for-authors"');
const helpFooterIndex = footer.indexOf('href: "/help"');
const articlesFooterIndex = footer.indexOf('href: "/articles"');
assert.ok(aboutFooterIndex >= 0, "footer registry includes /about");
assert.ok(philosophyFooterIndex >= 0, "footer registry includes /philosophy");
assert.ok(forAuthorsFooterIndex >= 0, "footer registry includes /for-authors");
assert.ok(helpFooterIndex >= 0, "footer registry includes /help");
assert.ok(articlesFooterIndex >= 0, "footer registry includes /articles");
assert.ok(
  aboutFooterIndex < philosophyFooterIndex &&
    philosophyFooterIndex < forAuthorsFooterIndex &&
    forAuthorsFooterIndex < articlesFooterIndex &&
    articlesFooterIndex < helpFooterIndex,
  "footer order: about, philosophy, for-authors, articles, then help",
);
assert.equal(
  (footer.match(/href: "\/help"/g) ?? []).length,
  1,
  "footer registry has a single /help link",
);

const profileAccount = read("src/components/profile/ProfileSections.tsx");
const accountSectionStart = profileAccount.indexOf(
  "export function ProfileAccountSection",
);
assert.ok(accountSectionStart >= 0, "ProfileAccountSection exists");
const accountSection = profileAccount.slice(accountSectionStart);
assert.match(accountSection, /href="\/help"/);
assert.match(accountSection, /Помощь и поддержка/);
const settingsRow = accountSection.indexOf('href="/settings"');
const helpRow = accountSection.indexOf('href="/help"');
const legalRow = accountSection.indexOf("SETTINGS_LEGAL_SECTION_ID");
assert.ok(settingsRow >= 0 && helpRow > settingsRow && legalRow > helpRow,
  "profile account order: settings → help → legal");
assert.equal(
  (accountSection.match(/href="\/help"/g) ?? []).length,
  1,
  "profile account has a single /help link",
);

const {
  LISTENER_SIDEBAR_NAV_ITEMS,
  getListenerSidebarNavItems,
  isListenerPrimaryNavItemActive,
} = await import("../src/lib/navigation/listener-nav.ts");
const helpSidebarItems = LISTENER_SIDEBAR_NAV_ITEMS.filter(
  (item) => item.key === "help" || item.href === "/help",
);
assert.equal(helpSidebarItems.length, 1, "sidebar registry has one help item");
assert.equal(helpSidebarItems[0].title, "Помощь");
assert.equal(helpSidebarItems[0].href, "/help");
assert.equal(helpSidebarItems[0].icon, "help");
const profileSidebarIndex = LISTENER_SIDEBAR_NAV_ITEMS.findIndex(
  (item) => item.key === "profile",
);
const helpSidebarIndex = LISTENER_SIDEBAR_NAV_ITEMS.findIndex(
  (item) => item.key === "help",
);
assert.ok(
  helpSidebarIndex === profileSidebarIndex + 1,
  "sidebar help sits next to profile",
);
const sidebarVisible = getListenerSidebarNavItems({ showMyMaterialsNav: false });
assert.equal(
  sidebarVisible.filter((item) => item.href === "/help").length,
  1,
  "filtered sidebar keeps a single help link",
);
assert.equal(
  isListenerPrimaryNavItemActive("/help", "/help", { isNeutralPath: false }),
  true,
  "/help activates sidebar help item",
);
assert.equal(
  isListenerPrimaryNavItemActive("/help/listeners", "/help", {
    isNeutralPath: false,
  }),
  true,
  "/help/** activates sidebar help item",
);
assert.equal(
  isListenerPrimaryNavItemActive("/help/support", "/profile", {
    isNeutralPath: false,
  }),
  false,
  "/help does not activate profile item",
);

const sidebarNav = read("src/components/listener/DesktopSidebarNav.tsx");
assert.match(sidebarNav, /item\.icon === "help"/);
assert.match(sidebarNav, /isListenerPrimaryNavItemActive/);

const homeLayout = read("src/app/(platform)/(listener)/(home)/layout.tsx");
assert.match(homeLayout, /!shellData\.isAuthenticated/);
assert.match(homeLayout, /<LegalFooter/);
assert.doesNotMatch(
  homeLayout,
  /xl:hidden/,
  "guest home LegalFooter is visible on desktop too",
);

const personalHome = read("src/components/home/PersonalHome.tsx");
assert.match(personalHome, /<LegalFooter/);

const legalFooter = read("src/components/LegalFooter.tsx");
assert.match(legalFooter, /PUBLIC_FOOTER_LINKS/);
assert.doesNotMatch(
  legalFooter,
  /href=["']\/help["']/,
  "LegalFooter does not hardcode /help (uses registry)",
);

const opportunities = read(
  "src/components/author-dashboard/AuthorOpportunitiesClient.tsx",
);
assert.match(opportunities, /Справочный центр/);

const privacy = read("src/app/(platform)/privacy/page.tsx");
assert.match(privacy, /текст обращения в поддержку/);

console.log("help-center-support-unit: ok");
