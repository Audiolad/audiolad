#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canAcquireFreeStudioMusic,
  canAcquirePaidStudioMusic,
  studioLicenseAmountMinor,
} from "../src/lib/studio-music/access";
import {
  handleStudioMusicCatalog,
  isFreePublicStudioMusicInventory,
  mapStudioMusicCatalogItem,
  resolveStudioMusicOwnership,
  type StudioMusicCatalogPublication,
  type StudioMusicCatalogStore,
} from "../src/lib/studio-music/catalog";
import {
  nextStudioMusicAlbumExpanded,
  resolveStudioMusicCatalogAction,
} from "../src/lib/studio-music/catalog-actions";
import {
  DEFAULT_STUDIO_MUSIC_FIXED_RUBLES,
  inferLegacyStudioMusicPricingMode,
  normalizeStudioMusicPricingForSave,
  resolveStudioMusicAcquisition,
  STUDIO_MUSIC_ACQUISITION_STATUS,
  STUDIO_MUSIC_PRICING_ERROR,
  STUDIO_MUSIC_PRICING_MODE,
  studioMusicPriceMinorToRubles,
  studioMusicPricingModeAfterListenerFlip,
} from "../src/lib/studio-music/pricing";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const PRACTICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function publication(
  overrides: Partial<StudioMusicCatalogPublication> = {},
): StudioMusicCatalogPublication {
  return {
    id: PRACTICE_ID,
    status: "published",
    deleted_at: null,
    product_kind: "music",
    publication_class: "release",
    music_usage_permission: "platform_reuse_allowed",
    is_free: false,
    price: 300,
    studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.AUTO_2X_LISTENER,
    studio_music_price_minor: null,
    catalog_visibility: "listed",
    is_catalog_listed: true,
    title: "Рассвет",
    ...overrides,
  };
}

function ownership() {
  return resolveStudioMusicOwnership({
    practice: publication(),
    commerciallyAccessible: true,
  });
}

// 1. existing free listener → Studio free after migration
assert.equal(
  inferLegacyStudioMusicPricingMode({ is_free: true, price: 0 }),
  STUDIO_MUSIC_PRICING_MODE.FREE,
);
assert.equal(
  resolveStudioMusicAcquisition({
    practice: publication({
      is_free: true,
      price: 0,
      studio_music_pricing_mode: null,
    }),
    listenerEffectiveMinor: null,
  }).status,
  STUDIO_MUSIC_ACQUISITION_STATUS.FREE,
);

// 2. existing paid → auto_2x_listener
assert.equal(
  inferLegacyStudioMusicPricingMode({ is_free: false, price: 300 }),
  STUDIO_MUSIC_PRICING_MODE.AUTO_2X_LISTENER,
);
const paidLegacy = resolveStudioMusicAcquisition({
  practice: publication({
    is_free: false,
    price: 300,
    studio_music_pricing_mode: null,
  }),
  listenerEffectiveMinor: 30000,
});
assert.equal(paidLegacy.pricing_mode, STUDIO_MUSIC_PRICING_MODE.AUTO_2X_LISTENER);
assert.equal(paidLegacy.amount_minor, 60000);

// 3. listener FREE + Studio FIXED 600
const freeListenerFixed = resolveStudioMusicAcquisition({
  practice: publication({
    is_free: true,
    price: 0,
    studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FIXED,
    studio_music_price_minor: 60000,
  }),
  listenerEffectiveMinor: null,
});
assert.equal(freeListenerFixed.status, STUDIO_MUSIC_ACQUISITION_STATUS.PAID);
assert.equal(freeListenerFixed.amount_minor, 60000);
assert.equal(freeListenerFixed.studio_is_free, false);
assert.equal(freeListenerFixed.listener_is_free, true);
assert.equal(
  canAcquireFreeStudioMusic(
    publication({
      is_free: true,
      price: 0,
      studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FIXED,
      studio_music_price_minor: 60000,
    }),
  ),
  false,
);
assert.equal(
  canAcquirePaidStudioMusic(
    publication({
      is_free: true,
      price: 0,
      studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FIXED,
      studio_music_price_minor: 60000,
    }),
  ),
  true,
);

// 4. listener PAID 300 + AUTO → Studio 600
const paidAuto = resolveStudioMusicAcquisition({
  practice: publication(),
  listenerEffectiveMinor: 30000,
});
assert.equal(paidAuto.amount_minor, 60000);
assert.equal(paidAuto.amount_minor, studioLicenseAmountMinor(30000));

// 5. listener PAID + promotion → AUTO uses 2× current effective
const promoAuto = resolveStudioMusicAcquisition({
  practice: publication({ price: 500 }),
  listenerEffectiveMinor: 20000,
});
assert.equal(promoAuto.amount_minor, 40000);
assert.notEqual(promoAuto.amount_minor, studioLicenseAmountMinor(50000));

// 6. FIXED: listener promotion does not change fixed Studio price
const fixedIgnoresPromo = resolveStudioMusicAcquisition({
  practice: publication({
    price: 500,
    studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FIXED,
    studio_music_price_minor: 90000,
  }),
  listenerEffectiveMinor: 20000,
});
assert.equal(fixedIgnoresPromo.amount_minor, 90000);
assert.equal(fixedIgnoresPromo.listener_effective_minor, 20000);

// 7. listener PAID + Studio FREE → free acquire OK
const paidListenerStudioFree = resolveStudioMusicAcquisition({
  practice: publication({
    studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FREE,
  }),
  listenerEffectiveMinor: 30000,
});
assert.equal(paidListenerStudioFree.status, STUDIO_MUSIC_ACQUISITION_STATUS.FREE);
assert.equal(
  canAcquireFreeStudioMusic(
    publication({ studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FREE }),
  ),
  true,
);
assert.equal(
  canAcquirePaidStudioMusic(
    publication({ studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FREE }),
  ),
  false,
);

// 8. paid checkout forbidden for Studio FREE
assert.notEqual(
  paidListenerStudioFree.status,
  STUDIO_MUSIC_ACQUISITION_STATUS.PAID,
);

// 9. free acquire forbidden for Studio FIXED/AUTO paid
assert.equal(
  canAcquireFreeStudioMusic(publication()),
  false,
);
assert.equal(
  canAcquireFreeStudioMusic(
    publication({
      studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FIXED,
      studio_music_price_minor: 60000,
    }),
  ),
  false,
);

// 10. price_changed works for fixed price change
const checkoutApi = read("src/lib/studio-music/checkout-api.ts");
assert.match(checkoutApi, /price_changed/);
assert.match(checkoutApi, /current_amount_minor/);
const ordersSql = read(
  "supabase/migrations/20261003120700_studio_music_independent_pricing.sql",
);
assert.match(ordersSql, /p_expected_amount_minor IS DISTINCT FROM v_amount_minor/);
assert.match(ordersSql, /studio_music_price_minor/);

// 11. listener ownership ≠ Studio entitlement
const listenerOwned = resolveStudioMusicOwnership({
  practice: publication(),
  entitlement: null,
  isAuthorMember: false,
});
assert.equal(listenerOwned.can_use, false);
assert.equal(listenerOwned.can_acquire, true);

// 12. Studio entitlement ≠ listener ownership / no user_practices
assert.doesNotMatch(read("src/lib/studio-music/pricing.ts"), /user_practices/);
assert.doesNotMatch(ordersSql, /INSERT INTO public\.user_practices/);
assert.doesNotMatch(
  read("src/app/api/studio/music/acquire/route.ts"),
  /from\(["']user_practices["']\)/,
);
assert.doesNotMatch(
  read("src/app/api/checkout/studio-music/route.ts"),
  /from\(["']user_practices["']\)/,
);

// 13–14. entitlement remains after price/mode/permission change (permanent)
assert.match(
  read("supabase/migrations/20261003120000_studio_music_entitlements.sql"),
  /Later price\/unpublish\/permission changes do not revoke/,
);
assert.doesNotMatch(ordersSql, /revoked_at = now\(\)/);
assert.match(ordersSql, /Publication edits never revoke/);

// 15–16. finance regressions stay in older migrations, not this one
assert.doesNotMatch(ordersSql, /author_share_bps/);
assert.doesNotMatch(ordersSql, /platform_absorbs/);
assert.doesNotMatch(ordersSql, /ceil_author_remainder_platform/);
assert.match(
  read("src/lib/payments/author-finance/types.ts"),
  /ceil author share/,
);
assert.match(
  read("supabase/migrations/20260726140000_payments_p332_author_ledger.sql"),
  /platform_absorbs/,
);

// 17–18. ordinary / course_upgrade checkout regressions
assert.match(read("src/app/api/orders/route.ts"), /create_practice_order/);
assert.doesNotMatch(
  read("src/app/api/orders/route.ts"),
  /create_studio_music_order/,
);
assert.match(
  read("src/app/api/checkout/course-upgrade/route.ts"),
  /create_course_upgrade_order/,
);
assert.doesNotMatch(
  read("src/app/api/checkout/course-upgrade/route.ts"),
  /create_studio_music_order/,
);

// Author save validation
assert.deepEqual(
  normalizeStudioMusicPricingForSave({
    productKind: "practice",
    musicUsagePermission: null,
    listenerIsFree: false,
    mode: "fixed",
    priceRubles: 600,
  }),
  { ok: true, mode: null, priceMinor: null },
);
assert.deepEqual(
  normalizeStudioMusicPricingForSave({
    productKind: "music",
    musicUsagePermission: "listen_only",
    listenerIsFree: false,
    mode: "fixed",
    priceRubles: 600,
  }),
  { ok: true, mode: null, priceMinor: null },
);
assert.equal(
  normalizeStudioMusicPricingForSave({
    productKind: "music",
    musicUsagePermission: "platform_reuse_allowed",
    listenerIsFree: true,
    mode: "auto_2x_listener",
  }).ok,
  false,
);
assert.equal(
  (
    normalizeStudioMusicPricingForSave({
      productKind: "music",
      musicUsagePermission: "platform_reuse_allowed",
      listenerIsFree: true,
      mode: "auto_2x_listener",
    }) as { code: string }
  ).code,
  STUDIO_MUSIC_PRICING_ERROR.AUTO_NOT_ALLOWED_FOR_FREE_LISTENER,
);
assert.deepEqual(
  normalizeStudioMusicPricingForSave({
    productKind: "music",
    musicUsagePermission: "platform_reuse_allowed",
    listenerIsFree: true,
    mode: "fixed",
    priceRubles: 600,
  }),
  { ok: true, mode: "fixed", priceMinor: 60000 },
);
assert.equal(
  normalizeStudioMusicPricingForSave({
    productKind: "music",
    musicUsagePermission: "platform_reuse_allowed",
    listenerIsFree: false,
    mode: "fixed",
    priceRubles: 10,
  }).ok,
  false,
);
assert.equal(
  studioMusicPricingModeAfterListenerFlip({
    reuseAllowed: true,
    listenerIsFree: true,
    currentMode: STUDIO_MUSIC_PRICING_MODE.AUTO_2X_LISTENER,
  }),
  null,
);
assert.equal(DEFAULT_STUDIO_MUSIC_FIXED_RUBLES, 600);
assert.equal(studioMusicPriceMinorToRubles(null), 0);
assert.equal(studioMusicPriceMinorToRubles(60000), 600);

// Catalog free filter = FREE FOR STUDIO
assert.equal(
  isFreePublicStudioMusicInventory(
    publication({
      is_free: true,
      price: 0,
      studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FIXED,
      studio_music_price_minor: 60000,
    }),
  ),
  false,
);
assert.equal(
  isFreePublicStudioMusicInventory(
    publication({
      is_free: false,
      price: 300,
      studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FREE,
    }),
  ),
  true,
);

const mappedFixed = mapStudioMusicCatalogItem({
  practice: publication({
    is_free: true,
    price: 0,
    studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FIXED,
    studio_music_price_minor: 60000,
  }),
  tracks: [{ id: "t1", title: "A", durationSeconds: 80 }],
  ownership: ownership(),
  listenerEffectiveMinor: null,
});
assert.equal(mappedFixed.is_free, false);
assert.equal(mappedFixed.studio_is_free, false);
assert.equal(mappedFixed.listener_is_free, true);
assert.equal(
  isFreePublicStudioMusicInventory(
    publication({
      is_free: true,
      price: 0,
      studio_music_pricing_mode: null,
    }),
  ),
  true,
);
assert.equal(
  isFreePublicStudioMusicInventory(
    publication({
      is_free: false,
      price: 300,
      studio_music_pricing_mode: null,
    }),
  ),
  false,
);
assert.equal(mappedFixed.studio_effective_minor, 60000);
assert.match(mappedFixed.listener_price_label, /Прослушивание: бесплатно/);
assert.match(mappedFixed.studio_price_label, /Для Студии/);
assert.equal(resolveStudioMusicCatalogAction(mappedFixed).kind, "paid");

function createStore(
  publicItems: StudioMusicCatalogPublication[],
): StudioMusicCatalogStore {
  return {
    async listPublicInventory({ filter }) {
      return {
        practices: publicItems.filter((item) =>
          filter === "free" ? isFreePublicStudioMusicInventory(item) : true,
        ),
        nextCursor: null,
      };
    },
    async listMine() {
      return {
        practices: [],
        nextCursor: null,
        entitlements: [],
        authorMemberAuthorIds: [],
      };
    },
    async loadPublishedTracks() {
      return [];
    },
    async loadTracksForMine() {
      return [];
    },
    async resolveCheckoutPrices(practiceIds) {
      return new Map(
        practiceIds.map((id) => [id, { listenerEffectiveMinor: 30000 }]),
      );
    },
  };
}

const freeTab = await handleStudioMusicCatalog({
  filter: "free",
  cursor: null,
  limit: "20",
  userId: null,
  store: createStore([
    publication({
      id: "11111111-1111-4111-8111-111111111111",
      is_free: true,
      price: 0,
      studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FIXED,
      studio_music_price_minor: 60000,
    }),
    publication({
      id: "22222222-2222-4222-8222-222222222222",
      is_free: false,
      price: 300,
      studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FREE,
    }),
  ]),
});
assert.equal(freeTab.status, 200);
assert.ok("items" in freeTab.body);
assert.equal(freeTab.body.items.length, 1);
assert.equal(
  freeTab.body.items[0]?.publication_id,
  "22222222-2222-4222-8222-222222222222",
);

assert.equal(
  nextStudioMusicAlbumExpanded({
    kind: "album",
    expanded: false,
    source: "row",
  }),
  true,
);
assert.equal(
  nextStudioMusicAlbumExpanded({
    kind: "album",
    expanded: true,
    source: "row",
  }),
  false,
);
assert.equal(
  nextStudioMusicAlbumExpanded({
    kind: "album",
    expanded: false,
    source: "tracks",
  }),
  true,
);
assert.equal(
  nextStudioMusicAlbumExpanded({
    kind: "album",
    expanded: true,
    source: "preview",
  }),
  true,
);
assert.equal(
  nextStudioMusicAlbumExpanded({
    kind: "album",
    expanded: false,
    source: "preview",
  }),
  false,
);
assert.equal(
  nextStudioMusicAlbumExpanded({
    kind: "album",
    expanded: true,
    source: "acquire",
  }),
  true,
);
assert.equal(
  nextStudioMusicAlbumExpanded({
    kind: "single",
    expanded: false,
    source: "row",
  }),
  false,
);

const overlay = read("src/components/studio/StudioMusicCatalogOverlay.tsx");
const card = read("src/components/studio/StudioMusicCatalogCard.tsx");
const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(overlay, /Бесплатно для Студии/);
assert.doesNotMatch(overlay, /sm:grid-cols-2/);
assert.match(overlay, /flex-col gap-2/);
assert.match(card, /md:flex-row/);
assert.match(card, /md:h-\[136px\]/);
assert.match(card, /h-36 w-full/);
assert.match(card, /stopPropagation/);
assert.match(card, /onClick=\{isAlbum \? \(\) => applyExpandClick\("row"\) : undefined\}/);
assert.match(card, /applyExpandClick\("tracks"\)/);
assert.match(card, /Треки/);
assert.match(card, /Прослушивание|listener_price_label/);
assert.match(card, /studio_price_label/);
assert.match(form, /Использование в Студии АудиоЛада/);
assert.match(form, /Бесплатно для Студии/);
assert.match(form, /Автоматическая цена/);
assert.match(form, /Своя цена/);
assert.match(form, /70%/);
assert.match(form, /studioMusicPricingModeAfterListenerFlip/);
assert.doesNotMatch(card, /practice-audio\//);
assert.doesNotMatch(overlay, /\/api\/catalog\/play/);

console.log("studio-music-pricing-unit: ok");
