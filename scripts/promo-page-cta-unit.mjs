#!/usr/bin/env node
/**
 * Promo page external CTA unit checks — safe without database access.
 */
import { readFileSync } from "node:fs";

import {
  buildPromoPageCtaAnalyticsPayload,
} from "../src/lib/promo-pages/analytics-events.ts";
import {
  getPromoPageCtaPreviewLabel,
  resolvePromoPageCtaTarget,
} from "../src/lib/promo-pages/cta-target.ts";
import { mapPublicPromoPageCtaBlock } from "../src/lib/promo-pages/public-page.ts";
import {
  aggregatePromotionFunnelMetrics,
  calculatePromotionConversions,
  detectPromotionStatsKind,
  PROMO_PAGE_FUNNEL_EVENTS,
} from "../src/lib/promotion/stats.ts";
import {
  resolvePublicPromoPageCta,
  validatePromoPageCtaForPublish,
} from "../src/lib/promo-pages/validation.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

function testInternalCtaTarget() {
  const target = resolvePromoPageCtaTarget("/catalog");

  assert(target?.kind === "internal", "internal catalog path");
  assert(target?.href === "/catalog", "internal href preserved");
}

function testExternalHttps() {
  const target = resolvePromoPageCtaTarget("https://max.ru/chat/123");

  assert(target?.kind === "external", "external https");
  assert(target?.host === "max.ru", "host extracted for analytics");
  assert(target?.href.startsWith("https://max.ru/"), "normalized https href");
}

function testRejectedTargets() {
  const rejected = [
    "http://example.com",
    "//example.com",
    "javascript:alert(1)",
    "data:text/html,abc",
    "file:///etc/passwd",
    "vbscript:msgbox(1)",
    "https://",
    "/auth/sign-in",
    "/api/analytics/events",
    `%2F%2Fexample.com`,
    "/authors/evil\u0000.example",
    "https://example.com/".padEnd(520, "a"),
  ];

  for (const value of rejected) {
    assert(resolvePromoPageCtaTarget(value) === "invalid", `rejected: ${value.slice(0, 40)}`);
  }
}

function testUnicodeWhitespaceRejected() {
  assert(resolvePromoPageCtaTarget("/authors/evil\u0001slug") === "invalid", "control char rejected");
}

function testPublishValidation() {
  assert(validatePromoPageCtaForPublish({ cta_enabled: false, cta_label: null, cta_href: null }) === null, "disabled cta ok");
  assert(
    validatePromoPageCtaForPublish({ cta_enabled: true, cta_label: "", cta_href: "https://max.ru" }) ===
      "promo_page_cta_label_required",
    "enabled without label rejected",
  );
  assert(
    validatePromoPageCtaForPublish({ cta_enabled: true, cta_label: "Go", cta_href: "" }) ===
      "promo_page_cta_href_required",
    "enabled without url rejected",
  );
  assert(
    validatePromoPageCtaForPublish({
      cta_enabled: true,
      cta_label: "Go",
      cta_href: "http://example.com",
    }) === "promo_page_cta_href_invalid",
    "enabled with invalid url rejected",
  );
}

function testPublicCtaResolution() {
  assert(resolvePublicPromoPageCta({ cta_enabled: false, cta_label: "Go", cta_href: "https://max.ru" }) === null, "disabled hidden");
  assert(
    resolvePublicPromoPageCta({
      cta_enabled: true,
      cta_label: "Продолжить в MAX",
      cta_href: "https://max.ru/chat",
      cta_heading: "Продолжите в чате",
    })?.label === "Продолжить в MAX",
    "enabled valid cta resolved",
  );
}

function testAnalyticsPayloadSanitization() {
  const payload = buildPromoPageCtaAnalyticsPayload({
    position: "after_practices",
    destination_kind: "external",
    destination_host: "max.ru",
    open_mode: "same_tab",
  });

  assert(payload.position === "after_practices", "position kept");
  assert(payload.destination_kind === "external", "destination kind kept");
  assert(payload.destination_host === "max.ru", "host only");
  assert(payload.open_mode === "same_tab", "open mode kept");
  assert(!("href" in payload), "no full url in payload");
  assert(!("url" in payload), "no url alias in payload");
}

function testCampaignStatsAggregation() {
  const rows = [
    {
      utm_source: "(none)",
      utm_medium: "(none)",
      utm_content: "(none)",
      event_name: PROMO_PAGE_FUNNEL_EVENTS.views,
      unique_visitors: 10,
      event_count: 12,
    },
    {
      utm_source: "(none)",
      utm_medium: "(none)",
      utm_content: "(none)",
      event_name: PROMO_PAGE_FUNNEL_EVENTS.playStarts,
      unique_visitors: 6,
      event_count: 7,
    },
    {
      utm_source: "(none)",
      utm_medium: "(none)",
      utm_content: "(none)",
      event_name: PROMO_PAGE_FUNNEL_EVENTS.completed,
      unique_visitors: 4,
      event_count: 4,
    },
    {
      utm_source: "(none)",
      utm_medium: "(none)",
      utm_content: "(none)",
      event_name: PROMO_PAGE_FUNNEL_EVENTS.ctaClicked,
      unique_visitors: 3,
      event_count: 3,
    },
  ];

  const metrics = aggregatePromotionFunnelMetrics(rows);
  const conversions = calculatePromotionConversions(metrics);

  assert(metrics.uniqueViews === 10, "promo page views aggregated");
  assert(metrics.uniquePlayStarts === 6, "promo page play starts aggregated");
  assert(metrics.uniqueCompleted === 4, "promo page completions aggregated");
  assert(metrics.uniqueCtaClicks === 3, "promo page cta clicks aggregated");
  assert(conversions.viewToCta === 30, "view to cta conversion");
  assert(conversions.playToCta === 50, "play to cta conversion");
  assert(detectPromotionStatsKind(rows) === "promo_page", "promo page stats kind");
}

function testPreviewLabels() {
  assert(
    getPromoPageCtaPreviewLabel("https://max.ru/chat") === "Откроется: max.ru",
    "external preview label",
  );
  assert(
    getPromoPageCtaPreviewLabel("/catalog") === "Внутренняя страница АудиоЛада",
    "internal preview label",
  );
}

function testPublicMapperInvalidEnabledCta() {
  const block = mapPublicPromoPageCtaBlock({
    promo_page_id: "page-1",
    cta_enabled: true,
    cta_heading: null,
    cta_description: null,
    cta_label: "Go",
    cta_href: "/auth/sign-in",
    cta_open_in_new_tab: false,
  });

  assert(block === null, "invalid enabled cta hidden on public page");
}

function testEditorAndPublicUi() {
  const form = read("src/components/author-dashboard/AuthorPromoPageForm.tsx");
  const client = read("src/components/promo-pages/PromoPublicPageClient.tsx");
  const presentation = read("src/components/promo-pages/PromoPagePresentation.tsx");

  assert(form.includes("Действие после прослушивания"), "editor section renamed");
  assert(form.includes("cta_enabled"), "editor persists cta_enabled");
  assert(form.includes("Продолжить в MAX"), "label preset present");
  assert(form.includes("getPromoPageCtaPreviewLabel"), "url preview wired");
  assert(!form.includes("buildAuthorPageCtaPreset"), "author fallback preset removed");
  assert(!client.includes("buildAuthorPageCtaPreset"), "public fallback removed");
  assert(client.includes("trackPromoPageViewedOnce"), "page view analytics wired");
  assert(client.includes("trackPromoPageCtaClicked"), "cta click analytics wired");
  assert(presentation.includes("PromoPageCtaButton"), "dedicated cta button block");
  assert(!presentation.includes("Больше практик автора"), "fallback label removed");
}

const tests = [
  ["internal cta target", testInternalCtaTarget],
  ["external https", testExternalHttps],
  ["rejected targets", testRejectedTargets],
  ["unicode whitespace rejected", testUnicodeWhitespaceRejected],
  ["publish validation", testPublishValidation],
  ["public cta resolution", testPublicCtaResolution],
  ["analytics payload sanitization", testAnalyticsPayloadSanitization],
  ["campaign stats aggregation", testCampaignStatsAggregation],
  ["preview labels", testPreviewLabels],
  ["public mapper invalid enabled cta", testPublicMapperInvalidEnabledCta],
  ["editor and public ui", testEditorAndPublicUi],
];

let failed = 0;

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}:`, error instanceof Error ? error.message : error);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`\n${tests.length} promo page cta checks passed`);
