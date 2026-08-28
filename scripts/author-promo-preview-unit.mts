import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHOR_PROMO_PREVIEW_VISITOR_ID,
  PRACTICE_PROMO_PREVIEW_QUERY_PARAM,
  buildSyntheticAuthorPromoStart,
  canActivatePromoPreviewMode,
  resolveAuthorPromoPreview,
  resolveAuthorPromoPreviewPrice,
  resolvePromoPreviewPresentationFlags,
  shouldMountPricePromotionStartHandler,
} from "../src/lib/pricing/author-promo-preview";
import {
  buildPersonalTimerOfferCopy,
  formatPersonalTimerRemaining,
} from "../src/lib/pricing/personal-timer-copy";
import { startPersonalCountdown } from "../src/lib/pricing/personal-start";
import { resolvePracticePrice } from "../src/lib/pricing/resolve";
import { PRICE_PROMOTION_TYPES, PRICE_SURFACES } from "../src/lib/pricing/types";
import {
  applyAuthorPromoPreviewBuyCta,
  buildPracticeAccessPresentation,
} from "../src/lib/products/practice-access-ui";
import { buildPracticePromoPreviewPath } from "../src/lib/products/paths";
import { formatRubles } from "../src/lib/products/price-format";
import { BUY_ACTION_LABEL } from "../src/lib/ui/action-labels";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function memberAccess() {
  return { isAuthorMember: true };
}

function strangerAccess() {
  return { isAuthorMember: false };
}

function promotion(overrides: Record<string, unknown> = {}) {
  return {
    id: "promo-preview-1",
    practiceId: "practice-1",
    name: "Internal 499",
    promotionType: PRICE_PROMOTION_TYPES.PERSONAL_COUNTDOWN,
    salePrice: 499,
    startsAt: null,
    endsAt: null,
    durationSeconds: 20 * 60,
    aboveTimerText: "Предложение действует ещё: {time_left}",
    belowButtonText:
      "Это предложение показывается вам один раз. После окончания таймера продукт останется доступен по полной цене {full_price}.",
    isActive: true,
    startToken: "token-preview-1",
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
    ...overrides,
  };
}

function start(overrides: Record<string, unknown> = {}) {
  return {
    id: "start-1",
    promotionId: "promo-preview-1",
    visitorId: "11111111-1111-4111-8111-111111111111",
    userId: null,
    startedAt: "2026-08-23T10:00:00.000Z",
    expiresAt: "2026-08-23T10:20:00.000Z",
    salePriceSnapshot: 499,
    ...overrides,
  };
}

function createPreviewSupabase(options: {
  row?: Record<string, unknown> | null;
  error?: { message: string } | null;
}) {
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const fromCalls: string[] = [];
  let queriedStarts = false;

  const supabase = {
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return { data: null, error: { message: "rpc_should_not_run" } };
    },
    from: (table: string) => {
      fromCalls.push(table);
      if (table === "practice_price_promotion_starts") {
        queriedStarts = true;
      }

      const maybeSingle = async () => ({
        data: options.row ?? null,
        error: options.error ?? null,
      });

      const filter = {
        eq: () => filter,
        maybeSingle,
      };

      return {
        select: () => filter,
      };
    },
  };

  return { supabase, rpcCalls, fromCalls, get queriedStarts() { return queriedStarts; } };
}

function testAuthorPreviewResolvesSaleCopyAndSyntheticTime() {
  const now = new Date("2026-08-27T12:00:00.000Z");
  const resolved = resolveAuthorPromoPreviewPrice({
    isFree: false,
    basePrice: 4999,
    promotion: promotion(),
    now,
  });

  assert.ok(resolved);
  assert.equal(resolved.salePrice, 499);
  assert.equal(resolved.basePrice, 4999);
  assert.equal(resolved.finalPrice, 499);
  assert.equal(resolved.promotion?.promotionType, "personal_countdown");
  assert.equal(
    resolved.promotion?.aboveTimerText,
    "Предложение действует ещё: {time_left}",
  );
  assert.match(resolved.promotion?.belowButtonText ?? "", /\{full_price\}/);

  const remainingMs =
    new Date(resolved.promotion?.expiresAt ?? "").getTime() - now.getTime();
  assert.equal(remainingMs, 20 * 60 * 1000);
  assert.equal(formatPersonalTimerRemaining(remainingMs), "20:00 мин.");

  const copy = buildPersonalTimerOfferCopy({
    remainingMs,
    basePrice: resolved.basePrice,
    aboveTimerText: resolved.promotion?.aboveTimerText,
    belowButtonText: resolved.promotion?.belowButtonText,
  });
  assert.equal(copy.above, "Предложение действует ещё: 20:00 мин.");
  assert.equal(copy.below.includes(formatRubles(4999)), true);
}

function testPreviewUsesCurrentPromotionSalePrice() {
  const now = new Date("2026-08-27T12:00:00.000Z");
  const preview = resolveAuthorPromoPreviewPrice({
    isFree: false,
    basePrice: 4999,
    promotion: promotion({ salePrice: 699 }),
    now,
  });
  assert.equal(preview?.finalPrice, 699, "preview follows current sale_price");
  assert.equal(preview?.salePrice, 699);

  const buyerStart = start({ salePriceSnapshot: 499 });
  const buyer = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promotion({ salePrice: 699 })],
    starts: [buyerStart],
    surface: PRICE_SURFACES.PRODUCT,
    now: new Date("2026-08-23T10:10:00.000Z"),
  });
  assert.equal(buyer.finalPrice, 499, "real start keeps snapshot while preview moves");
}

function testPreviewDoesNotNeedAStartRow() {
  const now = new Date("2026-08-27T12:00:00.000Z");
  const withoutStart = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promotion()],
    starts: [],
    surface: PRICE_SURFACES.PRODUCT,
    now,
  });
  assert.equal(withoutStart.finalPrice, 4999, "real resolve needs a start row");
  assert.equal(withoutStart.promotion, null);

  const preview = resolveAuthorPromoPreviewPrice({
    isFree: false,
    basePrice: 4999,
    promotion: promotion(),
    now,
  });
  assert.equal(preview?.finalPrice, 499, "preview synthesizes a start");
  assert.equal(preview?.promotion?.expiresAt, "2026-08-27T12:20:00.000Z");
}

function testReopenRestartsFullDuration() {
  const firstNow = new Date("2026-08-27T12:00:00.000Z");
  const secondNow = new Date("2026-08-27T12:07:00.000Z");
  const first = resolveAuthorPromoPreviewPrice({
    isFree: false,
    basePrice: 4999,
    promotion: promotion(),
    now: firstNow,
  });
  const second = resolveAuthorPromoPreviewPrice({
    isFree: false,
    basePrice: 4999,
    promotion: promotion(),
    now: secondNow,
  });

  assert.equal(
    new Date(first?.promotion?.expiresAt ?? "").getTime() - firstNow.getTime(),
    20 * 60 * 1000,
  );
  assert.equal(
    new Date(second?.promotion?.expiresAt ?? "").getTime() - secondNow.getTime(),
    20 * 60 * 1000,
  );
  assert.notEqual(first?.promotion?.expiresAt, second?.promotion?.expiresAt);
}

function testInactiveAndDraftStillPreview() {
  const now = new Date("2026-08-27T12:00:00.000Z");
  const inactive = resolveAuthorPromoPreviewPrice({
    isFree: false,
    basePrice: 4999,
    promotion: promotion({ isActive: false }),
    now,
  });
  assert.equal(inactive?.finalPrice, 499, "saved inactive card still previews");

  const draftPrice = resolveAuthorPromoPreviewPrice({
    isFree: false,
    basePrice: 4999,
    promotion: promotion(),
    now,
  });
  assert.equal(draftPrice?.finalPrice, 499, "resolve does not require published");

  const flags = resolvePromoPreviewPresentationFlags({
    promoPreviewMode: true,
    practiceStatus: "draft",
    publishPreviewMode: false,
    publishListenerViewMode: false,
    buyerPreviewMode: false,
    canUseBuyerPreview: true,
  });
  assert.equal(flags.publishPreviewMode, true);
  assert.equal(flags.publishListenerViewMode, true);
  assert.equal(flags.buyerPreviewMode, false);
}

function testPublishedUsesBuyerPresentation() {
  const flags = resolvePromoPreviewPresentationFlags({
    promoPreviewMode: true,
    practiceStatus: "published",
    publishPreviewMode: false,
    publishListenerViewMode: false,
    buyerPreviewMode: false,
    canUseBuyerPreview: true,
  });
  assert.equal(flags.buyerPreviewMode, true);
  assert.equal(flags.publishPreviewMode, false);
  assert.equal(flags.publishListenerViewMode, false);
}

function testOrdinaryListenerPreviewStaysUnchanged() {
  assert.equal(
    canActivatePromoPreviewMode({
      promoPreviewId: null,
      access: memberAccess(),
    }),
    false,
  );

  const flags = resolvePromoPreviewPresentationFlags({
    promoPreviewMode: false,
    practiceStatus: "draft",
    publishPreviewMode: true,
    publishListenerViewMode: true,
    buyerPreviewMode: false,
    canUseBuyerPreview: true,
  });
  assert.equal(flags.publishListenerViewMode, true);
  assert.equal(flags.buyerPreviewMode, false);
}

function testUnsignedAndNonOwnerCannotActivate() {
  assert.equal(
    canActivatePromoPreviewMode({
      promoPreviewId: "promo-preview-1",
      access: strangerAccess(),
    }),
    false,
  );
  assert.equal(
    canActivatePromoPreviewMode({
      promoPreviewId: "  ",
      access: memberAccess(),
    }),
    false,
  );
  assert.equal(
    canActivatePromoPreviewMode({
      promoPreviewId: "promo-preview-1",
      access: memberAccess(),
    }),
    true,
  );
}

async function testPreviewLoaderDoesNotCallStartPath() {
  const row = {
    id: "promo-preview-1",
    practice_id: "practice-1",
    name: "Internal 499",
    promotion_type: "personal_countdown",
    sale_price: 499,
    starts_at: null,
    ends_at: null,
    duration_seconds: 1200,
    above_timer_text: "Предложение действует ещё: {time_left}",
    below_button_text: "Потом {full_price}",
    is_active: true,
    start_token: "token-preview-1",
    created_at: "2026-08-23T00:00:00.000Z",
    updated_at: "2026-08-23T00:00:00.000Z",
  };
  const ownerDb = createPreviewSupabase({ row });
  const owner = await resolveAuthorPromoPreview({
    supabase: ownerDb.supabase as never,
    practiceId: "practice-1",
    promotionId: "promo-preview-1",
    isFree: false,
    basePrice: 4999,
    isAuthorMember: true,
    now: new Date("2026-08-27T12:00:00.000Z"),
  });

  assert.equal(owner?.finalPrice, 499);
  assert.equal(ownerDb.rpcCalls.length, 0, "no start/bind/resolve RPC");
  assert.equal(ownerDb.queriedStarts, false, "no starts table read");
  assert.ok(!ownerDb.fromCalls.includes("practice_price_promotion_starts"));

  const strangerDb = createPreviewSupabase({ row });
  const stranger = await resolveAuthorPromoPreview({
    supabase: strangerDb.supabase as never,
    practiceId: "practice-1",
    promotionId: "promo-preview-1",
    isFree: false,
    basePrice: 4999,
    isAuthorMember: false,
    now: new Date("2026-08-27T12:00:00.000Z"),
  });
  assert.equal(stranger, null);
  assert.equal(strangerDb.rpcCalls.length, 0);
  assert.equal(strangerDb.fromCalls.length, 0, "stranger never loads the row");
}

function testBuyerPromoStillCreatesAndReusesOneShot() {
  const now = new Date("2026-08-23T10:00:00.000Z");
  const later = new Date("2026-08-23T10:10:00.000Z");
  const afterExpiry = new Date("2026-08-23T10:25:00.000Z");
  const visitorId = "11111111-1111-4111-8111-111111111111";

  const first = startPersonalCountdown({
    store: [],
    promotionId: "promo-preview-1",
    visitorId,
    userId: null,
    now,
    durationSeconds: 20 * 60,
    salePriceSnapshot: 499,
  });
  assert.equal(first.created, true);
  assert.equal(first.store.length, 1);

  const reuse = startPersonalCountdown({
    store: first.store,
    promotionId: "promo-preview-1",
    visitorId,
    userId: null,
    now: later,
    durationSeconds: 20 * 60,
    salePriceSnapshot: 699,
  });
  assert.equal(reuse.created, false);
  assert.equal(reuse.start.startedAt, first.start.startedAt);
  assert.equal(reuse.start.expiresAt, first.start.expiresAt);
  assert.equal(reuse.store.length, 1);

  const expired = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promotion()],
    starts: reuse.store,
    surface: PRICE_SURFACES.PRODUCT,
    now: afterExpiry,
  });
  assert.equal(expired.finalPrice, 4999);
  assert.equal(expired.promotion, null);

  const afterExpiryStart = startPersonalCountdown({
    store: reuse.store,
    promotionId: "promo-preview-1",
    visitorId,
    userId: null,
    now: afterExpiry,
    durationSeconds: 20 * 60,
    salePriceSnapshot: 699,
  });
  assert.equal(afterExpiryStart.created, false, "expired start is never restarted");
  assert.equal(afterExpiryStart.start.expiresAt, first.start.expiresAt);
}

function testExpiredRealStartStaysFullPrice() {
  const resolved = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promotion()],
    starts: [start({ expiresAt: "2026-08-23T10:00:00.000Z" })],
    surface: PRICE_SURFACES.PRODUCT,
    now: new Date("2026-08-23T10:10:00.000Z"),
  });
  assert.equal(resolved.salePrice, null);
  assert.equal(resolved.finalPrice, 4999);
  assert.equal(resolved.promotion, null);
}

function testSyntheticStartIsNotABuyerBinding() {
  const startRow = buildSyntheticAuthorPromoStart({
    promotionId: "promo-preview-1",
    durationSeconds: 1200,
    now: new Date("2026-08-27T12:00:00.000Z"),
    salePriceSnapshot: 499,
  });
  assert.equal(startRow.visitorId, AUTHOR_PROMO_PREVIEW_VISITOR_ID);
  assert.equal(startRow.userId, null);
  assert.match(startRow.visitorId, /author-promo-preview/);
  assert.doesNotMatch(
    startRow.visitorId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
}

function testCalendarAndMissingPromotionDoNotSimulate() {
  assert.equal(
    resolveAuthorPromoPreviewPrice({
      isFree: false,
      basePrice: 4999,
      promotion: promotion({
        promotionType: PRICE_PROMOTION_TYPES.CALENDAR,
        startsAt: "2026-08-23T09:00:00.000Z",
        endsAt: "2026-08-23T18:00:00.000Z",
        durationSeconds: null,
      }),
    }),
    null,
  );
  assert.equal(
    resolveAuthorPromoPreviewPrice({
      isFree: false,
      basePrice: 4999,
      promotion: null,
    }),
    null,
  );
}

function testStartHandlerMountGate() {
  assert.equal(
    shouldMountPricePromotionStartHandler({
      promoStartToken: "token",
      promoPreviewMode: false,
    }),
    true,
  );
  assert.equal(
    shouldMountPricePromotionStartHandler({
      promoStartToken: "token",
      promoPreviewMode: true,
    }),
    false,
    "author preview must not mount the buyer start handler",
  );
  assert.equal(
    shouldMountPricePromotionStartHandler({
      promoStartToken: null,
      promoPreviewMode: false,
    }),
    false,
  );
}

function paidDraftPractice() {
  return {
    id: "practice-1",
    slug: "draft-product",
    price: 4999,
    is_free: false,
    format: "Медитация",
    status: "draft",
    is_catalog_listed: false,
    guest_access_enabled: false,
    audio_url: "https://cdn.example/audio.mp3",
    author_id: "author-1",
  };
}

function publishedPractice() {
  return {
    ...paidDraftPractice(),
    slug: "published-product",
    status: "published",
    is_catalog_listed: true,
  };
}

function ownerAccess() {
  return {
    canListen: true,
    canAcquire: false,
    isPubliclyListed: false,
    reason: "author_owner" as const,
    isAuthorMember: true,
    accessSource: null,
    hasEntitlement: false,
  };
}

function guestBuyerAccess() {
  return {
    canListen: false,
    canAcquire: true,
    isPubliclyListed: true,
    reason: "not_authenticated" as const,
    isAuthorMember: false,
    accessSource: null,
    hasEntitlement: false,
  };
}

function testPromoPreviewBuyCtaLooksLiveButIsPreviewOnly() {
  const draft = buildPracticeAccessPresentation({
    access: ownerAccess(),
    practice: paidDraftPractice(),
    authorSlug: "sergey",
    paymentsConfigured: true,
    isAuthenticated: true,
    publishPreviewMode: true,
    publishListenerViewMode: true,
    promoPreviewMode: true,
  });

  assert.equal(draft.primaryAction.kind, "buy");
  if (draft.primaryAction.kind === "buy") {
    assert.equal(draft.primaryAction.label, BUY_ACTION_LABEL);
    assert.equal(draft.primaryAction.label, "Купить");
    assert.equal(draft.primaryAction.disabled, false);
    assert.equal(draft.primaryAction.previewOnly, true);
  }

  const published = buildPracticeAccessPresentation({
    access: ownerAccess(),
    practice: publishedPractice(),
    authorSlug: "sergey",
    paymentsConfigured: true,
    isAuthenticated: true,
    buyerPreviewMode: true,
    promoPreviewMode: true,
  });

  assert.equal(published.primaryAction.kind, "buy");
  if (published.primaryAction.kind === "buy") {
    assert.equal(published.primaryAction.label, "Купить");
    assert.equal(published.primaryAction.disabled, false);
    assert.equal(published.primaryAction.previewOnly, true);
  }

  const paymentsOff = buildPracticeAccessPresentation({
    access: ownerAccess(),
    practice: paidDraftPractice(),
    authorSlug: "sergey",
    paymentsConfigured: false,
    isAuthenticated: true,
    publishPreviewMode: true,
    publishListenerViewMode: true,
    promoPreviewMode: true,
  });
  assert.equal(paymentsOff.primaryAction.kind, "buy");
  if (paymentsOff.primaryAction.kind === "buy") {
    assert.equal(paymentsOff.primaryAction.label, "Купить");
    assert.equal(paymentsOff.primaryAction.disabled, false);
    assert.equal(paymentsOff.primaryAction.previewOnly, true);
  }
}

function testOrdinaryBuyerPdpKeepsLiveBuy() {
  const publishedGuest = buildPracticeAccessPresentation({
    access: guestBuyerAccess(),
    practice: publishedPractice(),
    authorSlug: "sergey",
    paymentsConfigured: true,
    isAuthenticated: false,
  });

  assert.equal(publishedGuest.primaryAction.kind, "buy");
  if (publishedGuest.primaryAction.kind === "buy") {
    assert.equal(publishedGuest.primaryAction.label, "Купить");
    assert.equal(publishedGuest.primaryAction.disabled, false);
    assert.equal(publishedGuest.primaryAction.previewOnly, undefined);
  }

  const ownerBuyerPreview = buildPracticeAccessPresentation({
    access: ownerAccess(),
    practice: publishedPractice(),
    authorSlug: "sergey",
    paymentsConfigured: true,
    isAuthenticated: true,
    buyerPreviewMode: true,
    promoPreviewMode: false,
  });
  assert.equal(ownerBuyerPreview.primaryAction.kind, "buy");
  if (ownerBuyerPreview.primaryAction.kind === "buy") {
    assert.equal(ownerBuyerPreview.primaryAction.previewOnly, undefined);
    assert.equal(ownerBuyerPreview.primaryAction.purchaseSurface, "preview");
  }

  const listenerWithoutPromo = buildPracticeAccessPresentation({
    access: ownerAccess(),
    practice: paidDraftPractice(),
    authorSlug: "sergey",
    paymentsConfigured: true,
    isAuthenticated: true,
    publishPreviewMode: true,
    publishListenerViewMode: true,
    promoPreviewMode: false,
  });
  assert.equal(listenerWithoutPromo.primaryAction.kind, "buy");
  if (listenerWithoutPromo.primaryAction.kind === "buy") {
    assert.equal(listenerWithoutPromo.primaryAction.previewOnly, undefined);
  }

  const liveBuy = {
    kind: "buy" as const,
    label: "Купить",
    disabled: false,
    practiceSlug: "published-product",
    practiceId: "practice-1",
    authorId: "author-1",
    productPriceMinorSnapshot: 499900,
    currency: "RUB",
    purchaseSurface: "practice_page" as const,
  };
  const untouched = applyAuthorPromoPreviewBuyCta(
    {
      statusBadge: "4 999 ₽",
      statusDetail: null,
      showAuthorToolbar: false,
      showBuyerPreviewBanner: false,
      showBuyerPreviewExit: false,
      showPublishPreviewBanner: false,
      canPublishFromPreview: false,
      authorToolbarMessage: null,
      authorToolbarActions: [],
      showAdminPreview: false,
      primaryAction: liveBuy,
      libraryAction: "sign_in",
      showPaymentLegalNote: true,
    },
    false,
  );
  assert.equal(untouched.primaryAction, liveBuy);
}

function testPathUsesPromotionIdNotStartToken() {
  assert.equal(
    PRACTICE_PROMO_PREVIEW_QUERY_PARAM,
    "promo_preview",
  );
  assert.equal(
    buildPracticePromoPreviewPath("sergey", "draft-product", "promo-preview-1"),
    "/practice/sergey/draft-product?preview=publish&view=listener&promo_preview=promo-preview-1",
  );
  assert.doesNotMatch(
    buildPracticePromoPreviewPath(
      "sergey",
      "draft-product",
      "promo-preview-1",
    ),
    /[?&]promo=/,
  );
}

function testSourceContracts() {
  const preview = read("src/lib/pricing/author-promo-preview.ts");
  const page = read(
    "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
  );
  const form = read("src/components/author-dashboard/AuthorProductPromotions.tsx");
  const startRoute = read("src/app/api/price-promotions/start/route.ts");
  const startHandler = read(
    "src/components/pricing/PricePromotionStartHandler.tsx",
  );
  const visitor = read("src/lib/pricing/visitor.ts");
  const productForm = read(
    "src/components/author-dashboard/AuthorProductForm.tsx",
  );

  assert.doesNotMatch(preview, /ensurePriceVisitorId/);
  assert.doesNotMatch(preview, /start_practice_price_promotion/);
  assert.doesNotMatch(
    preview,
    /from ["']@\/components\/pricing\/PricePromotionStartHandler["']/,
  );
  assert.doesNotMatch(preview, /audiolad_price_visitor/);
  assert.match(preview, /resolvePracticePrice/);
  assert.match(preview, /isAuthorMember/);

  assert.match(page, /promo_preview/);
  assert.match(page, /canActivatePromoPreviewMode/);
  assert.match(page, /resolveAuthorPromoPreview/);
  assert.match(page, /shouldMountPricePromotionStartHandler/);
  assert.match(page, /PricePromotionStartHandler/);
  assert.match(page, /resolvePracticePriceRpc/);
  assert.match(page, /promoPreviewMode,/);

  const buyButton = read("src/components/BuyPracticeButton.tsx");
  const parts = read(
    "src/components/products/practice-page/PracticePageParts.tsx",
  );
  const accessUi = read("src/lib/products/practice-access-ui.ts");

  assert.match(buyButton, /previewOnly = false/);
  assert.match(buyButton, /useState\(\(\) => !previewOnly\)/);
  assert.match(buyButton, /if \(previewOnly\) \{\s*return;/);
  assert.doesNotMatch(
    buyButton,
    /if \(previewOnly\) \{\s*setIsCheckingPending/,
    "previewOnly effect must not setState",
  );
  assert.match(buyButton, /\/api\/orders/);
  assert.match(buyButton, /\/api\/payments/);
  assert.match(parts, /previewOnly=\{buyAction\.previewOnly === true\}/);
  assert.match(parts, /FEATURED_CARD_PRIMARY_CTA_CLASS/);
  assert.match(accessUi, /previewOnly: true/);
  assert.match(accessUi, /applyAuthorPromoPreviewBuyCta/);
  assert.doesNotMatch(
    parts,
    /previewOnly=\{true\}/,
    "ordinary BuyPracticeButton is not hard-coded preview-only",
  );

  assert.match(form, /Предпросмотр акции/);
  assert.match(form, /data-author-promo-preview/);
  assert.match(form, /Редактировать/);
  assert.match(form, /data-author-promo-edit/);
  assert.match(form, /buildPracticePromoPreviewPath/);
  assert.match(form, /Выключить/);
  assert.match(form, /Удалить/);
  assert.match(productForm, /authorSlug=\{selectedAuthor\?\.slug/);
  assert.match(productForm, /productSlug=\{form\.slug/);

  assert.match(startRoute, /ensurePriceVisitorId/);
  assert.match(startRoute, /start_practice_price_promotion/);
  assert.match(startHandler, /\/api\/price-promotions\/start/);
  assert.match(visitor, /export async function ensurePriceVisitorId/);
}

async function main() {
  testAuthorPreviewResolvesSaleCopyAndSyntheticTime();
  testPreviewUsesCurrentPromotionSalePrice();
  testPreviewDoesNotNeedAStartRow();
  testReopenRestartsFullDuration();
  testInactiveAndDraftStillPreview();
  testPublishedUsesBuyerPresentation();
  testOrdinaryListenerPreviewStaysUnchanged();
  testUnsignedAndNonOwnerCannotActivate();
  await testPreviewLoaderDoesNotCallStartPath();
  testBuyerPromoStillCreatesAndReusesOneShot();
  testExpiredRealStartStaysFullPrice();
  testSyntheticStartIsNotABuyerBinding();
  testCalendarAndMissingPromotionDoNotSimulate();
  testStartHandlerMountGate();
  testPathUsesPromotionIdNotStartToken();
  testPromoPreviewBuyCtaLooksLiveButIsPreviewOnly();
  testOrdinaryBuyerPdpKeepsLiveBuy();
  testSourceContracts();
  console.log("author-promo-preview-unit: ok");
}

await main();
