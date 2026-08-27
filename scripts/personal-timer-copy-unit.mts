import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parsePromotionWriteBody } from "../src/lib/pricing/author-promotions.ts";
import {
  DEFAULT_PERSONAL_TIMER_ABOVE_TEXT,
  DEFAULT_PERSONAL_TIMER_BELOW_TEXT,
  PERSONAL_TIMER_COPY_MAX_LENGTH,
  PERSONAL_TIMER_FULL_PRICE_TOKEN,
  PERSONAL_TIMER_TIME_LEFT_TOKEN,
  buildPersonalTimerOfferCopy,
  formatPersonalTimerRemaining,
  resolvePersonalTimerCopy,
  substitutePersonalTimerTokens,
} from "../src/lib/pricing/personal-timer-copy.ts";
import { resolvePracticePrice } from "../src/lib/pricing/resolve.ts";
import { PRICE_PROMOTION_TYPES, PRICE_SURFACES } from "../src/lib/pricing/types.ts";
import { formatRubles } from "../src/lib/products/price-format.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function promotion(overrides: Record<string, unknown> = {}) {
  return {
    id: "promo-1",
    practiceId: "practice-1",
    name: "Internal label",
    promotionType: PRICE_PROMOTION_TYPES.PERSONAL_COUNTDOWN,
    salePrice: 499,
    startsAt: null,
    endsAt: null,
    durationSeconds: 20 * 60,
    aboveTimerText: null,
    belowButtonText: null,
    isActive: true,
    startToken: "token-1",
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
    ...overrides,
  };
}

function start(overrides: Record<string, unknown> = {}) {
  return {
    id: "start-1",
    promotionId: "promo-1",
    visitorId: "11111111-1111-4111-8111-111111111111",
    userId: null,
    startedAt: "2026-08-23T10:00:00.000Z",
    expiresAt: "2026-08-23T10:20:00.000Z",
    ...overrides,
  };
}

function testDefaultsAndFallbacks() {
  assert.equal(
    DEFAULT_PERSONAL_TIMER_ABOVE_TEXT,
    `Предложение действует ещё: ${PERSONAL_TIMER_TIME_LEFT_TOKEN}`,
  );
  assert.equal(
    DEFAULT_PERSONAL_TIMER_BELOW_TEXT,
    `Это предложение показывается вам один раз. После окончания таймера продукт останется доступен по полной цене ${PERSONAL_TIMER_FULL_PRICE_TOKEN}.`,
  );

  const missing = resolvePersonalTimerCopy({});
  assert.equal(missing.aboveTimerText, DEFAULT_PERSONAL_TIMER_ABOVE_TEXT);
  assert.equal(missing.belowButtonText, DEFAULT_PERSONAL_TIMER_BELOW_TEXT);

  const empty = resolvePersonalTimerCopy({
    aboveTimerText: "   ",
    belowButtonText: null,
  });
  assert.equal(empty.aboveTimerText, DEFAULT_PERSONAL_TIMER_ABOVE_TEXT);
  assert.equal(empty.belowButtonText, DEFAULT_PERSONAL_TIMER_BELOW_TEXT);
}

function testMinutesScaleActiveCopy() {
  const remainingMs = (19 * 60 + 40) * 1000;
  const copy = buildPersonalTimerOfferCopy({
    remainingMs,
    basePrice: 2888,
  });

  assert.equal(formatPersonalTimerRemaining(remainingMs), "19:40 мин.");
  assert.equal(copy.above, "Предложение действует ещё: 19:40 мин.");
  assert.match(copy.below, /полн(?:ой|ая) цене/);
  assert.equal(copy.below.includes(formatRubles(2888)), true);
  assert.equal(copy.below.includes("4 999"), false);
  assert.equal(copy.above.includes(PERSONAL_TIMER_TIME_LEFT_TOKEN), false);
}

function testDifferentBasePrices() {
  const first = buildPersonalTimerOfferCopy({
    remainingMs: 90_000,
    basePrice: 1888,
  });
  const second = buildPersonalTimerOfferCopy({
    remainingMs: 90_000,
    basePrice: 2888,
  });

  assert.equal(first.below.includes(formatRubles(1888)), true);
  assert.equal(second.below.includes(formatRubles(2888)), true);
  assert.equal(first.below.includes(formatRubles(2888)), false);
}

function testDaysScaleRemaining() {
  const remainingMs = (2 * 86_400 + 18 * 3_600) * 1000;
  assert.equal(formatPersonalTimerRemaining(remainingMs), "2 дн. 18 ч.");
  assert.equal(formatPersonalTimerRemaining(remainingMs).includes(":"), false);

  const copy = buildPersonalTimerOfferCopy({
    remainingMs,
    basePrice: 900,
  });
  assert.match(copy.above, /2 дн\. 18 ч\./);
}

function testDeletedTokenIsNotReinserted() {
  const copy = buildPersonalTimerOfferCopy({
    remainingMs: 19 * 60 * 1000,
    basePrice: 1999,
    aboveTimerText: "Успейте купить",
    belowButtonText: "После таймера цена станет обычной.",
  });

  assert.equal(copy.above, "Успейте купить");
  assert.equal(copy.below, "После таймера цена станет обычной.");
  assert.equal(copy.above.includes("19:00"), false);
  assert.equal(copy.below.includes(formatRubles(1999)), false);
}

function testCustomCopyKeepsTokens() {
  const copy = buildPersonalTimerOfferCopy({
    remainingMs: (12 * 60 + 5) * 1000,
    basePrice: 777,
    aboveTimerText: `Живое окно: ${PERSONAL_TIMER_TIME_LEFT_TOKEN}`,
    belowButtonText: `Потом ${PERSONAL_TIMER_FULL_PRICE_TOKEN}`,
  });

  assert.equal(copy.above, "Живое окно: 12:05 мин.");
  assert.equal(copy.below, `Потом ${formatRubles(777)}`);
}

function testSubstituteDoesNotInventTokens() {
  assert.equal(
    substitutePersonalTimerTokens("без переменных", {
      timeLeft: "19:40 мин.",
      fullPrice: formatRubles(1000),
    }),
    "без переменных",
  );
}

function testNoPromotionAndOtherTypeDoNotGetPersonalCopy() {
  const none = resolvePracticePrice({
    isFree: false,
    basePrice: 1999,
    promotions: [],
    starts: [],
    surface: PRICE_SURFACES.PRODUCT,
    now: new Date("2026-08-23T10:10:00.000Z"),
  });
  assert.equal(none.promotion, null);
  assert.equal(none.salePrice, null);
  assert.equal(none.finalPrice, 1999);

  const calendar = resolvePracticePrice({
    isFree: false,
    basePrice: 1999,
    promotions: [
      promotion({
        promotionType: PRICE_PROMOTION_TYPES.CALENDAR,
        durationSeconds: null,
        startsAt: "2026-08-23T10:00:00.000Z",
        endsAt: "2026-08-24T10:00:00.000Z",
        salePrice: 888,
      }),
    ],
    starts: [],
    surface: PRICE_SURFACES.PRODUCT,
    now: new Date("2026-08-23T10:10:00.000Z"),
  });
  assert.equal(calendar.promotion?.promotionType, "calendar");
  assert.equal(calendar.promotion?.aboveTimerText, null);
  assert.equal(calendar.promotion?.belowButtonText, null);
}

function testExpiredPersonalLeavesBasePrice() {
  const resolved = resolvePracticePrice({
    isFree: false,
    basePrice: 2888,
    promotions: [promotion({ salePrice: 499 })],
    starts: [start({ expiresAt: "2026-08-23T10:00:00.000Z" })],
    surface: PRICE_SURFACES.PRODUCT,
    now: new Date("2026-08-23T10:10:00.000Z"),
  });

  assert.equal(resolved.salePrice, null);
  assert.equal(resolved.finalPrice, 2888);
  assert.equal(resolved.promotion, null);
}

function testActivePersonalPassesCopyThroughResolve() {
  const resolved = resolvePracticePrice({
    isFree: false,
    basePrice: 2888,
    promotions: [
      promotion({
        aboveTimerText: `Ещё ${PERSONAL_TIMER_TIME_LEFT_TOKEN}`,
        belowButtonText: `Дальше ${PERSONAL_TIMER_FULL_PRICE_TOKEN}`,
      }),
    ],
    starts: [start()],
    surface: PRICE_SURFACES.PRODUCT,
    now: new Date("2026-08-23T10:10:00.000Z"),
  });

  assert.equal(resolved.salePrice, 499);
  assert.equal(resolved.promotion?.aboveTimerText, `Ещё ${PERSONAL_TIMER_TIME_LEFT_TOKEN}`);
  assert.equal(
    resolved.promotion?.belowButtonText,
    `Дальше ${PERSONAL_TIMER_FULL_PRICE_TOKEN}`,
  );
}

function testParseCopyFields() {
  const withCopy = parsePromotionWriteBody(
    {
      name: "Таймер",
      promotion_type: "personal_countdown",
      sale_price: 499,
      duration_seconds: 1200,
      above_timer_text: DEFAULT_PERSONAL_TIMER_ABOVE_TEXT,
      below_button_text: DEFAULT_PERSONAL_TIMER_BELOW_TEXT,
    },
    2888,
  );
  assert.equal(withCopy.ok, true);
  if (withCopy.ok) {
    assert.equal(withCopy.aboveTimerText, DEFAULT_PERSONAL_TIMER_ABOVE_TEXT);
    assert.equal(withCopy.belowButtonText, DEFAULT_PERSONAL_TIMER_BELOW_TEXT);
  }

  const missing = parsePromotionWriteBody(
    {
      name: "Таймер",
      promotion_type: "personal_countdown",
      sale_price: 499,
      duration_seconds: 1200,
    },
    2888,
  );
  assert.equal(missing.ok, true);
  if (missing.ok) {
    assert.equal(missing.aboveTimerText, null);
    assert.equal(missing.belowButtonText, null);
  }

  const calendar = parsePromotionWriteBody(
    {
      name: "Календарь",
      promotion_type: "calendar",
      sale_price: 888,
      starts_at: "2026-08-23T10:00:00.000Z",
      ends_at: "2026-08-24T10:00:00.000Z",
      above_timer_text: DEFAULT_PERSONAL_TIMER_ABOVE_TEXT,
      below_button_text: DEFAULT_PERSONAL_TIMER_BELOW_TEXT,
    },
    1888,
  );
  assert.equal(calendar.ok, true);
  if (calendar.ok) {
    assert.equal(calendar.aboveTimerText, null);
    assert.equal(calendar.belowButtonText, null);
  }

  const tooLong = parsePromotionWriteBody(
    {
      name: "Таймер",
      promotion_type: "personal_countdown",
      sale_price: 499,
      duration_seconds: 1200,
      above_timer_text: "я".repeat(PERSONAL_TIMER_COPY_MAX_LENGTH + 1),
    },
    2888,
  );
  assert.equal(tooLong.ok, false);
}

function testSourceContracts() {
  const form = read("src/components/author-dashboard/AuthorProductPromotions.tsx");
  const offer = read("src/components/pricing/ProductPriceOffer.tsx");
  const parts = read(
    "src/components/products/practice-page/PracticePageParts.tsx",
  );
  const page = read(
    "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
  );
  const migration = read(
    "supabase/migrations/20260830120000_personal_timer_promotion_copy.sql",
  );

  assert.match(form, /Текст над таймером/);
  assert.match(form, /Текст под кнопкой/);
  assert.match(form, /DEFAULT_PERSONAL_TIMER_ABOVE_TEXT/);
  assert.match(form, /DEFAULT_PERSONAL_TIMER_BELOW_TEXT/);
  assert.match(form, /data-author-promo-above-timer/);
  assert.match(form, /data-author-promo-below-button/);
  assert.match(form, /placeholder/, "name field may keep a placeholder");
  assert.doesNotMatch(
    form.slice(form.indexOf("Текст над таймером")),
    /placeholder=/,
    "copy fields are real values, not placeholders",
  );
  assert.match(form, /promotionType === "personal_countdown"/);

  assert.match(offer, /buildPersonalTimerOfferCopy/);
  assert.match(offer, /data-product-price-offer-headline/);
  assert.match(offer, /data-product-price-offer-explanation/);
  assert.doesNotMatch(offer, /4 999|4999/);
  assert.doesNotMatch(offer, /25 готовых решений/);
  assert.doesNotMatch(offer, /Сергей Петров/);

  assert.match(parts, /aboveTimerText=\{viewModel\.priceOffer\.aboveTimerText\}/);
  assert.match(parts, /belowButtonText=\{viewModel\.priceOffer\.belowButtonText\}/);
  assert.match(parts, /BuyPracticeButton/);
  assert.match(parts, /productPriceMinorSnapshot=/);

  assert.match(page, /aboveTimerText: resolvedPrice\?\.promotion\?\.aboveTimerText/);
  assert.match(page, /publishListenerViewMode/);
  assert.doesNotMatch(page, /25-meditation-solutions/);

  assert.match(migration, /ADD COLUMN IF NOT EXISTS above_timer_text/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS below_button_text/);
}

testDefaultsAndFallbacks();
testMinutesScaleActiveCopy();
testDifferentBasePrices();
testDaysScaleRemaining();
testDeletedTokenIsNotReinserted();
testCustomCopyKeepsTokens();
testSubstituteDoesNotInventTokens();
testNoPromotionAndOtherTypeDoNotGetPersonalCopy();
testExpiredPersonalLeavesBasePrice();
testActivePersonalPassesCopyThroughResolve();
testParseCopyFields();
testSourceContracts();

console.log("personal-timer-copy-unit: ok");
