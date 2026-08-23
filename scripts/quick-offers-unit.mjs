#!/usr/bin/env node
/**
 * Quick Offer domain checks — no database required.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  extractOfferWindowExpiresAt,
  extractQuickOfferId,
} from "../src/lib/orders/create-order-api.ts";
import { formatMaterialCaption } from "../src/lib/quick-offers/format-labels.ts";
import { buildQuickOfferPath } from "../src/lib/quick-offers/paths.ts";
import {
  formatTimerMmSs,
  interpolateCtaText,
  isOfferWindowActive,
  resolveOfferChargeRubles,
  resolveOfferDisplayPricing,
  resolveOfferTimer,
} from "../src/lib/quick-offers/pricing.ts";
import {
  buildOfferTimerCookieName,
  buildOfferTimerStorageKey,
  persistOfferTimer,
} from "../src/lib/quick-offers/timer.ts";
import { QUICK_OFFER_TEMPLATE_KEY } from "../src/lib/quick-offers/types.ts";
import {
  isPracticeQuickOfferEligible,
  normalizeFormatLabel,
  normalizeQuickOfferSlug,
  validateFormatLabel,
  validatePromoPrice,
  validateQuickOfferSlug,
  validateQuickOfferTitle,
} from "../src/lib/quick-offers/validation.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

function testValidation() {
  assert(validateQuickOfferSlug("25-gotovyh-resheniy") === null, "valid slug");
  assert(validateQuickOfferSlug("A") === "quick_offer_slug_too_short", "short slug");
  assert(validateQuickOfferSlug("Hello World") === null, "slugify then valid");
  assert(normalizeQuickOfferSlug("Привет мир") === "privet-mir", "transliterate");
  assert(validateQuickOfferTitle("") === "quick_offer_title_required", "title required");
  assert(validateFormatLabel("PDF") === null, "preset ok");
  assert(validateFormatLabel("Аудио") === null, "cyrillic preset ok");
  assert(validateFormatLabel("TOOLONG") === "quick_offer_format_too_long", "max 6");
  assert(validateFormatLabel("PD\nF") === "quick_offer_format_newline", "newline rejected");
  assert(validateFormatLabel("A\rB") === "quick_offer_format_newline", "cr rejected");
  assert(normalizeFormatLabel(" PDF ") === "PDF", "trim");
  assert(validatePromoPrice(499) === null, "promo ok");
  assert(validatePromoPrice(0) === "quick_offer_promo_price_invalid", "promo zero");
  assert(validatePromoPrice(12.5) === "quick_offer_promo_price_invalid", "promo int");
  assert(
    isPracticeQuickOfferEligible(
      { author_id: "a", status: "published", is_free: false, price: 4399 },
      "a",
    ),
    "own paid product eligible",
  );
  assert(
    !isPracticeQuickOfferEligible(
      { author_id: "b", status: "published", is_free: false, price: 499 },
      "a",
    ),
    "foreign product rejected",
  );
  assert(
    !isPracticeQuickOfferEligible(
      { author_id: "a", status: "published", is_free: true, price: 0 },
      "a",
    ),
    "free product rejected",
  );
  assert(
    !isPracticeQuickOfferEligible(
      { author_id: "a", status: "draft", is_free: false, price: 499 },
      "a",
    ),
    "draft product rejected",
  );
}

function testPricingAndTimer() {
  const now = Date.parse("2026-08-23T10:00:00.000Z");
  const first = resolveOfferTimer({
    nowMs: now,
    durationSeconds: 1200,
    storedExpiresAt: null,
  });
  const refresh = resolveOfferTimer({
    nowMs: now + 15_000,
    durationSeconds: 1200,
    storedExpiresAt: first.expiresAt,
  });

  assert(first.remainingSeconds === 1200, "new visitor gets full duration");
  assert(refresh.expiresAt === first.expiresAt, "refresh keeps same expiry");
  assert(refresh.remainingSeconds === 1185, "refresh counts down");
  assert(!refresh.isExpired, "not expired yet");

  const expired = resolveOfferTimer({
    nowMs: now + 1_300_000,
    durationSeconds: 1200,
    storedExpiresAt: first.expiresAt,
  });
  assert(expired.isExpired, "expired after duration");
  assert(expired.remainingSeconds === 0, "no negative remaining");

  const active = resolveOfferDisplayPricing({
    regularPrice: 4399,
    promoPrice: 499,
    nowMs: now,
    durationSeconds: 1200,
    expiresAt: first.expiresAt,
  });
  assert(active.showPromo, "promo shown while timer live");
  assert(active.chargePrice === 499, "charge promo while live");

  const after = resolveOfferDisplayPricing({
    regularPrice: 4399,
    promoPrice: 499,
    nowMs: now + 1_300_000,
    durationSeconds: 1200,
    expiresAt: first.expiresAt,
  });
  assert(!after.showPromo, "stop claiming promo after expiry");
  assert(after.chargePrice === 4399, "charge regular after expiry");

  assert(
    resolveOfferChargeRubles({
      regularPrice: 4399,
      promoPrice: 499,
      nowMs: now,
      durationSeconds: 1200,
      expiresAt: null,
    }) === 499,
    "missing window treated as new visitor promo",
  );

  assert(
    !isOfferWindowActive({
      nowMs: now,
      durationSeconds: 1200,
      expiresAt: new Date(now + 3_600_000).toISOString(),
    }),
    "far-future window is rejected",
  );

  assert(formatTimerMmSs(125) === "02:05", "mm:ss");
  assert(
    interpolateCtaText("Получить за {price} ₽", "499") === "Получить за 499 ₽",
    "cta interpolate",
  );

  const persisted = persistOfferTimer({
    offerId: "11111111-1111-4111-8111-111111111111",
    durationSeconds: 1200,
    storedExpiresAt: first.expiresAt,
    nowMs: now + 1000,
  });
  assert(persisted.expiresAt === first.expiresAt, "persist helper keeps expiry");
  assert(
    buildOfferTimerCookieName("abc") === "al_qo_abc",
    "cookie name is offer-scoped",
  );
  assert(
    buildOfferTimerStorageKey("abc", 1200) === "al_qo_abc_1200",
    "storage key includes duration",
  );
}

function testCaptions() {
  assert(formatMaterialCaption(0, "PDF") === "01 · PDF", "first card");
  assert(formatMaterialCaption(1, "Аудио") === "02 · Аудио", "second card");
  assert(formatMaterialCaption(25, "Бонус") === "26 · Бонус", "twenty sixth");
  assert(
    formatMaterialCaption(0, "TOOLONG") === "01 · TOOLON",
    "caption clips format to 6",
  );
  assert(buildQuickOfferPath("pack") === "/offers/pack", "public path");
  assert(QUICK_OFFER_TEMPLATE_KEY === "catalog/quick-offer", "first template key");
}

function testCheckoutHelpers() {
  assert(
    extractQuickOfferId({
      quick_offer_id: "11111111-1111-4111-8111-111111111111",
    }) === "11111111-1111-4111-8111-111111111111",
    "offer id extracted",
  );
  assert(extractQuickOfferId({ quick_offer_id: "nope" }) === null, "bad offer id");
  assert(
    extractOfferWindowExpiresAt({
      offer_window_expires_at: "2026-08-23T10:20:00.000Z",
    }) === "2026-08-23T10:20:00.000Z",
    "window extracted",
  );
  assert(
    extractOfferWindowExpiresAt({ offer_window_expires_at: "not-a-date" }) ===
      null,
    "bad window rejected",
  );

  const orders = read("src/app/api/orders/route.ts");
  assert(orders.includes("apply_quick_offer_amount"), "orders apply offer amount");
  assert(orders.includes("extractQuickOfferId"), "orders read offer id");
  assert(!orders.includes("amount_minor:"), "orders still do not take client amount");

  const button = read("src/components/BuyPracticeButton.tsx");
  assert(button.includes("quickOfferId"), "buy button can pass offer id");
  assert(!button.includes("amount_minor"), "buy button never sends amount");
}

function testMigrationAndWiring() {
  const sql = read("supabase/migrations/20260823140000_quick_offers.sql");
  assert(sql.includes("CREATE TABLE IF NOT EXISTS public.quick_offers"), "offers table");
  assert(
    sql.includes("CREATE TABLE IF NOT EXISTS public.quick_offer_materials"),
    "materials table",
  );
  assert(sql.includes("UNIQUE (slug)"), "global unique slug");
  assert(sql.includes("format_label !~ E'[\\r\\n]'"), "sql format no newline");
  assert(sql.includes("char_length(format_label) <= 6"), "sql format max 6");
  assert(sql.includes("user_can_read_author_promotion"), "reuse promotion ACL");
  assert(sql.includes("publish_quick_offer"), "publish rpc");
  assert(sql.includes("unpublish_quick_offer"), "unpublish rpc");
  assert(sql.includes("get_public_quick_offer"), "public rpc");
  assert(sql.includes("AND qo.status = 'published'"), "drafts not public");
  assert(sql.includes("apply_quick_offer_amount"), "server price rpc");
  assert(sql.includes("quick_offer_product_owner_mismatch"), "owner trigger");
  assert(sql.includes("template_key = 'catalog/quick-offer'"), "template key check");
  assert(sql.includes("GRANT EXECUTE ON FUNCTION public.get_public_quick_offer"), "anon public read");
  assert(sql.includes("TO authenticated"), "author grants");
  assert(!sql.includes("4399"), "no hardcoded catalog price in sql");

  const client = read("src/components/author-dashboard/AuthorPromotionClient.tsx");
  assert(client.includes("AuthorQuickOffersClient"), "cabinet section wired");

  const page = read("src/app/(platform)/offers/[slug]/page.tsx");
  assert(page.includes("loadPublicQuickOfferCached"), "public page loads rpc");
  assert(page.includes("QuickOfferPublicPage"), "public presentation");
}

function testNoHardcodedSkuCopy() {
  const files = [
    "src/components/quick-offers/QuickOfferPublicPage.tsx",
    "src/components/author-dashboard/AuthorQuickOfferForm.tsx",
    "src/components/author-dashboard/AuthorQuickOffersClient.tsx",
  ];

  for (const file of files) {
    const source = read(file);
    assert(!source.includes("4 399"), `${file} has no hardcoded 4399 display`);
    assert(!source.includes("4399"), `${file} has no hardcoded 4399`);
    assert(
      !source.includes("25 готовых"),
      `${file} has no hardcoded 25-pack title`,
    );
  }
}

function testFilesExist() {
  for (const file of [
    "src/app/api/author/promotion/offers/route.ts",
    "src/app/api/author/promotion/offers/[id]/publish/route.ts",
    "src/lib/quick-offers/offers-api.ts",
    "src/lib/images/image-profiles.ts",
  ]) {
    assert(read(join(file)).includes("export"), `${file} exists`);
  }

  const profiles = read("src/lib/images/image-profiles.ts");
  assert(profiles.includes("quick-offer-hero"), "hero profile");
  assert(profiles.includes("quick-offer-card"), "3:4 card profile");
  assert(profiles.includes("targetAspectRatio: 3 / 4"), "card is 3:4");
}

testValidation();
testPricingAndTimer();
testCaptions();
testCheckoutHelpers();
testMigrationAndWiring();
testNoHardcodedSkuCopy();
testFilesExist();

console.log("quick-offers-unit: ok");
