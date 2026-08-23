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
import {
  createSignedOfferWindow,
  issueOrReuseOfferWindow,
  parseCookieHeaderValue,
  resolveServerOfferWindowExpiresAt,
  verifySignedOfferWindow,
} from "../src/lib/quick-offers/offer-window-token.ts";
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
  persistOfferTimer,
} from "../src/lib/quick-offers/timer.ts";
import { QUICK_OFFER_TEMPLATE_KEY } from "../src/lib/quick-offers/types.ts";
import {
  countVisibleCharacters,
  isPracticeQuickOfferEligible,
  normalizeFormatLabel,
  normalizeQuickOfferSlug,
  validateFormatLabel,
  validatePromoPrice,
  validateQuickOfferSlug,
  validateQuickOfferTitle,
} from "../src/lib/quick-offers/validation.ts";

process.env.CHECKOUT_STATUS_SECRET ??= "quick-offer-unit-test-secret";

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
  assert(validateFormatLabel("Видео") === null, "video preset ok");
  assert(validateFormatLabel("Текст") === null, "text preset ok");
  assert(countVisibleCharacters("Аудио") === 5, "Аудио is 5 visible chars");
  assert(countVisibleCharacters("Видео") === 5, "Видео is 5 visible chars");
  assert(countVisibleCharacters("Текст") === 5, "Текст is 5 visible chars");
  assert(validateFormatLabel("TOOLONG") === "quick_offer_format_too_long", "max 6 ascii");
  assert(
    validateFormatLabel("Аудио!!") === "quick_offer_format_too_long",
    "7 cyrillic/punctuation chars rejected",
  );
  assert(
    validateFormatLabel("Аудио!") === null,
    "6 visible cyrillic+punct accepted",
  );
  assert(validateFormatLabel("PD\nF") === "quick_offer_format_newline", "newline rejected");
  assert(validateFormatLabel("A\rB") === "quick_offer_format_newline", "cr rejected");
  assert(normalizeFormatLabel(" PDF ") === "PDF", "trim");
  assert(validatePromoPrice(499) === null, "promo ok");
  assert(validatePromoPrice(0) === "quick_offer_promo_price_invalid", "promo zero");
  assert(validatePromoPrice(-1) === "quick_offer_promo_price_invalid", "promo negative");
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

function testPromoActiveExpiredAndManipulatedTimer() {
  const now = Date.parse("2026-08-23T10:00:00.000Z");
  const offerId = "11111111-1111-4111-8111-111111111111";
  const first = resolveOfferTimer({
    nowMs: now,
    durationSeconds: 1200,
    storedExpiresAt: new Date(now + 1_200_000).toISOString(),
  });
  const refresh = resolveOfferTimer({
    nowMs: now + 15_000,
    durationSeconds: 1200,
    storedExpiresAt: first.expiresAt,
  });

  assert(first.remainingSeconds === 1200, "known window keeps full remaining");
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
    }) === 4399,
    "missing window is regular — server does not trust absence as new visitor",
  );

  assert(
    !isOfferWindowActive({
      nowMs: now,
      durationSeconds: 1200,
      expiresAt: null,
    }),
    "null window is not active",
  );

  assert(
    !isOfferWindowActive({
      nowMs: now,
      durationSeconds: 1200,
      expiresAt: new Date(now + 3_600_000).toISOString(),
    }),
    "far-future window is rejected",
  );

  const forgedFuture = new Date(now + 3_600_000).toISOString();
  assert(
    resolveOfferChargeRubles({
      regularPrice: 4399,
      promoPrice: 499,
      nowMs: now,
      durationSeconds: 1200,
      expiresAt: forgedFuture,
    }) === 4399,
    "forged far-future timestamp does not keep promo",
  );

  const signed = createSignedOfferWindow({
    offerId,
    durationSeconds: 1200,
    nowSeconds: Math.floor(now / 1000),
  });
  assert(verifySignedOfferWindow(signed.token, offerId, Math.floor(now / 1000)).ok, "signed ok");

  const tampered = `${signed.token.slice(0, -2)}aa`;
  assert(
    !verifySignedOfferWindow(tampered, offerId, Math.floor(now / 1000)).ok,
    "tampered signature rejected",
  );

  const unsignedCookie = `al_qo_${offerId}=${encodeURIComponent(forgedFuture)}`;
  assert(
    resolveServerOfferWindowExpiresAt({
      offerId,
      cookieHeader: unsignedCookie,
      nowSeconds: Math.floor(now / 1000),
    }) === null,
    "unsigned ISO cookie is not a server window",
  );

  const validCookie = `al_qo_${offerId}=${signed.token}`;
  assert(
    resolveServerOfferWindowExpiresAt({
      offerId,
      cookieHeader: validCookie,
      nowSeconds: Math.floor(now / 1000),
    }) === new Date(signed.payload.windowExpiresAt * 1000).toISOString(),
    "signed cookie yields server expires_at",
  );

  const reused = issueOrReuseOfferWindow({
    offerId,
    durationSeconds: 1200,
    existingToken: signed.token,
    nowSeconds: Math.floor(now / 1000) + 30,
  });
  assert(reused.token === signed.token, "reuse does not mint a new window");
  assert(
    reused.payload.windowExpiresAt === signed.payload.windowExpiresAt,
    "refresh does not extend expires_at",
  );

  const swappedLater = createSignedOfferWindow({
    offerId,
    durationSeconds: 1200,
    nowSeconds: Math.floor(now / 1000),
    windowExpiresAt: Math.floor(now / 1000) + 10_000,
  });
  assert(
    !isOfferWindowActive({
      nowMs: now,
      durationSeconds: 1200,
      expiresAt: new Date(swappedLater.payload.windowExpiresAt * 1000).toISOString(),
    }),
    "window longer than configured duration is rejected even if signed payload is read as ISO",
  );

  const expiredSigned = createSignedOfferWindow({
    offerId,
    durationSeconds: 1200,
    nowSeconds: Math.floor(now / 1000) - 1300,
    windowExpiresAt: Math.floor(now / 1000) - 100,
  });
  const expiredIso = new Date(expiredSigned.payload.windowExpiresAt * 1000).toISOString();
  assert(
    resolveOfferChargeRubles({
      regularPrice: 4399,
      promoPrice: 499,
      nowMs: now,
      durationSeconds: 1200,
      expiresAt: expiredIso,
    }) === 4399,
    "expired signed window charges regular",
  );

  const otherOffer = createSignedOfferWindow({
    offerId: "22222222-2222-4222-8222-222222222222",
    durationSeconds: 1200,
    nowSeconds: Math.floor(now / 1000),
  });
  assert(
    resolveServerOfferWindowExpiresAt({
      offerId,
      cookieHeader: `al_qo_${offerId}=${otherOffer.token}`,
      nowSeconds: Math.floor(now / 1000),
    }) === null,
    "cookie for another offer id is rejected",
  );

  assert(formatTimerMmSs(125) === "02:05", "mm:ss");
  assert(
    interpolateCtaText("Получить за {price} ₽", "499") === "Получить за 499 ₽",
    "cta interpolate",
  );

  const persisted = persistOfferTimer({
    offerId,
    durationSeconds: 1200,
    storedExpiresAt: first.expiresAt,
    nowMs: now + 1000,
  });
  assert(persisted.expiresAt === first.expiresAt, "persist helper keeps expiry");
  assert(
    buildOfferTimerCookieName(offerId) === `al_qo_${offerId}`,
    "cookie name is offer-scoped",
  );
  assert(
    parseCookieHeaderValue(validCookie, `al_qo_${offerId}`) === signed.token,
    "cookie header parser reads signed token",
  );
}

function testCaptions() {
  assert(formatMaterialCaption(0, "PDF") === "01 · PDF", "first card");
  assert(formatMaterialCaption(1, "Аудио") === "02 · Аудио", "second card");
  assert(formatMaterialCaption(25, "Бонус") === "26 · Бонус", "twenty sixth");
  assert(
    formatMaterialCaption(0, "TOOLONG") === "01 · TOOLON",
    "caption clips format to 6 visible chars",
  );
  assert(buildQuickOfferPath("pack") === "/offers/pack", "public path");
  assert(QUICK_OFFER_TEMPLATE_KEY === "catalog/quick-offer", "first template key");
}

function testCheckoutGetsServerPrice() {
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
    "body timestamp can be parsed",
  );

  const orders = read("src/app/api/orders/route.ts");
  assert(orders.includes("applyServerQuickOfferAmount"), "orders apply signed window");
  assert(orders.includes("extractQuickOfferId"), "orders read offer id");
  assert(!orders.includes("extractOfferWindowExpiresAt"), "orders ignore body expires_at");
  assert(!orders.includes("offer_window_expires_at"), "orders do not read client timestamp");
  assert(!orders.includes("amount_minor:"), "orders still do not take client amount");

  const payments = read("src/app/api/payments/route.ts");
  assert(payments.includes("applyServerQuickOfferAmount"), "payments reprice before intent");
  assert(payments.includes("quick_offer_id"), "payments read stored offer id");
  assert(
    payments.includes("quick_offer_amount_changed"),
    "stale pending payment is not reused after expiry reprice",
  );

  const button = read("src/components/BuyPracticeButton.tsx");
  assert(button.includes("quickOfferId"), "buy button can pass offer id");
  assert(!button.includes("offer_window_expires_at"), "buy button never sends timer");
  assert(!button.includes("amount_minor"), "buy button never sends amount");

  const apply = read("src/lib/quick-offers/apply-offer-amount.ts");
  assert(
    apply.includes("resolveServerOfferWindowExpiresAt"),
    "charge uses signed cookie only",
  );
}

function testDraftSeoOwnershipAndPublish() {
  const sql = read("supabase/migrations/20260823140000_quick_offers.sql");
  assert(sql.includes("CREATE TABLE IF NOT EXISTS public.quick_offers"), "offers table");
  assert(
    sql.includes("CREATE TABLE IF NOT EXISTS public.quick_offer_materials"),
    "materials table",
  );
  assert(sql.includes("UNIQUE (slug)"), "global unique slug");
  assert(sql.includes("format_label !~ E'[\\r\\n]'"), "sql format no newline");
  assert(sql.includes("char_length(format_label) <= 6"), "sql format max 6 characters");
  assert(!sql.includes("octet_length(format_label)"), "sql does not count bytes");
  assert(sql.includes("user_can_read_author_promotion"), "reuse promotion ACL");
  assert(sql.includes("publish_quick_offer"), "publish rpc");
  assert(sql.includes("unpublish_quick_offer"), "unpublish rpc");
  assert(sql.includes("get_public_quick_offer"), "public rpc");
  assert(sql.includes("AND qo.status = 'published'"), "drafts not public");
  assert(sql.includes("apply_quick_offer_amount"), "server price rpc");
  assert(sql.includes("quick_offer_product_owner_mismatch"), "owner trigger");
  assert(sql.includes("quick_offer_product_locked"), "published product lock");
  assert(sql.includes("template_key = 'catalog/quick-offer'"), "template key check");
  assert(sql.includes("GRANT EXECUTE ON FUNCTION public.get_public_quick_offer"), "anon public read");
  assert(sql.includes("TO authenticated"), "author grants");
  assert(!sql.includes("4399"), "no hardcoded catalog price in sql");
  assert(
    sql.includes("Missing / unproven window is regular price"),
    "null window is regular in sql",
  );
  assert(sql.includes("quick_offer_id = p_quick_offer_id"), "order remembers offer id");
  assert(
    !/'created_by'/.test(sql) || !sql.includes("'created_by', v_offer.created_by"),
    "public rpc does not leak created_by",
  );

  const publicRpc = sql.slice(sql.indexOf("get_public_quick_offer"));
  assert(!publicRpc.includes("v_offer.created_by"), "public dto omits created_by");

  const client = read("src/components/author-dashboard/AuthorPromotionClient.tsx");
  assert(client.includes("AuthorQuickOffersClient"), "cabinet section wired");

  const page = read("src/app/(platform)/offers/[slug]/page.tsx");
  assert(page.includes("loadPublicQuickOfferCached"), "public page loads rpc");
  assert(page.includes("QuickOfferPublicPage"), "public presentation");
  assert(page.includes("index: false"), "published offer is noindex");
  assert(page.includes("follow: false"), "published offer is nofollow");
  assert(!page.includes("index: true,"), "offers are never indexable");
  assert(!page.includes("alternates:"), "no indexing canonical");

  const offersApi = read("src/lib/quick-offers/offers-api.ts");
  assert(
    offersApi.includes("quick_offer_product_locked"),
    "api rejects product swap after publish",
  );

  const robots = read("src/lib/seo/robots-config.ts");
  assert(robots.includes('"/offers/"'), "robots disallow /offers/");

  const sitemap = read("src/lib/seo/sitemap-data.ts");
  assert(!sitemap.includes("quick_offers"), "sitemap does not query quick offers");
  assert(!sitemap.includes("/offers/"), "sitemap has no offer paths");

  const indexnowHooks = read("src/lib/seo/indexnow/urls.ts");
  assert(indexnowHooks.includes("SEO_ROBOTS_DISALLOWED_PATHS"), "IndexNow uses robots list");

  const publishRoute = read(
    "src/app/api/author/promotion/offers/[id]/publish/route.ts",
  );
  const unpublishRoute = read(
    "src/app/api/author/promotion/offers/[id]/unpublish/route.ts",
  );
  assert(publishRoute.includes("POSTPublish"), "publish route wired");
  assert(unpublishRoute.includes("POSTUnpublish"), "unpublish route wired");
  assert(!publishRoute.includes("scheduleIndexNowNotification"), "publish skips IndexNow");
  assert(!unpublishRoute.includes("scheduleIndexNowNotification"), "unpublish skips IndexNow");
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

  const publicPage = read("src/components/quick-offers/QuickOfferPublicPage.tsx");
  assert(
    !publicPage.includes("localStorage"),
    "public page does not persist timer in localStorage",
  );
  assert(
    publicPage.includes("/api/offers/") && publicPage.includes("/window"),
    "public page syncs server-issued window",
  );
  assert(publicPage.includes("grid-cols-2"), "mobile grid is 2 columns");
  assert(publicPage.includes("aspect-[3/4]"), "cards are 3:4");
  assert(publicPage.includes("safe-area-inset-bottom"), "sticky respects iPhone safe area");
}

function testFilesExist() {
  for (const file of [
    "src/app/api/author/promotion/offers/route.ts",
    "src/app/api/author/promotion/offers/[id]/publish/route.ts",
    "src/app/api/offers/[slug]/window/route.ts",
    "src/lib/quick-offers/offers-api.ts",
    "src/lib/quick-offers/offer-window-token.ts",
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
testPromoActiveExpiredAndManipulatedTimer();
testCaptions();
testCheckoutGetsServerPrice();
testDraftSeoOwnershipAndPublish();
testNoHardcodedSkuCopy();
testFilesExist();

console.log("quick-offers-unit: ok");
