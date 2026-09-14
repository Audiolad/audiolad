#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getCoverPublicUrl } from "../src/lib/author-products/utils";
import { getProductCoverDisplayUrl } from "../src/lib/products/cover-display";
import { studioLicenseAmountMinor } from "../src/lib/studio-music/access";
import { STUDIO_MUSIC_PRICING_MODE } from "../src/lib/studio-music/pricing";
import {
  applyStudioMusicCatalogCursor,
  decodeStudioMusicCatalogCursor,
  encodeStudioMusicCatalogCursor,
  formatStudioCatalogPriceLabel,
  handleStudioMusicCatalog,
  isFreePublicStudioMusicInventory,
  isMineStudioMusicPublication,
  isPublicStudioMusicInventory,
  isStudioMusicListedVisibilityRow,
  mapStudioMusicCatalogItem,
  paginateStudioMusicCatalogItems,
  parseStudioMusicCatalogFilter,
  parseStudioMusicCatalogLimit,
  parseStudioMusicCatalogQuery,
  resolveStudioMusicDisplayLabel,
  resolveStudioMusicKind,
  resolveStudioMusicOwnership,
  studioMusicCatalogDtoContainsForbiddenFields,
  studioMusicCatalogSortTimestamp,
  studioMusicCatalogFreeOrFilter,
  studioMusicCatalogPaidOrFilter,
  studioMusicCatalogSearchWords,
  studioMusicListedVisibilityOrFilter,
  matchesStudioMusicCatalogSearch,
  isPaidPublicStudioMusicInventory,
  takeStudioMusicCatalogPage,
  type StudioMusicCatalogPublication,
  type StudioMusicCatalogStore,
} from "../src/lib/studio-music/catalog";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const listedAllowed: StudioMusicCatalogPublication = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "published",
  deleted_at: null,
  product_kind: "music",
  publication_class: "release",
  music_usage_permission: "platform_reuse_allowed",
  is_free: false,
  price: 500,
  studio_music_pricing_mode: "auto_2x_listener",
  studio_music_price_minor: null,
  catalog_visibility: "listed",
  is_catalog_listed: true,
  title: "Рассвет",
  author_id: "author-1",
  published_at: "2026-09-01T00:00:00.000Z",
  created_at: "2026-08-01T00:00:00.000Z",
  authors: { name: "Анна", slug: "anna" },
};

function publication(
  overrides: Partial<StudioMusicCatalogPublication> = {},
): StudioMusicCatalogPublication {
  return { ...listedAllowed, ...overrides };
}

assert.equal(parseStudioMusicCatalogFilter("all"), "all");
assert.equal(parseStudioMusicCatalogFilter("MINE"), "mine");
assert.equal(parseStudioMusicCatalogFilter("free"), "free");
assert.equal(parseStudioMusicCatalogFilter("paid"), "paid");
assert.equal(parseStudioMusicCatalogFilter("unknown"), null);
assert.equal(parseStudioMusicCatalogQuery("  "), null);
assert.equal(parseStudioMusicCatalogQuery(null), null);
assert.equal(parseStudioMusicCatalogQuery("  Рассвет  "), "Рассвет");
assert.deepEqual(studioMusicCatalogSearchWords("тихий рассвет"), ["тихий", "рассвет"]);
assert.deepEqual(studioMusicCatalogSearchWords("   "), []);

assert.equal(parseStudioMusicCatalogLimit("20"), 20);
assert.equal(parseStudioMusicCatalogLimit("99"), 50);

assert.equal(isPublicStudioMusicInventory(listedAllowed), true);
assert.equal(
  isPublicStudioMusicInventory(publication({ publication_class: "release", product_kind: "practice" })),
  true,
);
assert.equal(isPublicStudioMusicInventory(publication({ status: "unpublished" })), false);
assert.equal(
  isPublicStudioMusicInventory(publication({ deleted_at: "2026-09-01T00:00:00.000Z" })),
  false,
);
assert.equal(
  isPublicStudioMusicInventory(
    publication({ product_kind: "practice", publication_class: "practice" }),
  ),
  false,
);
assert.equal(
  isPublicStudioMusicInventory(
    publication({ music_usage_permission: "listen_only" }),
  ),
  false,
);
assert.equal(
  isPublicStudioMusicInventory(
    publication({ catalog_visibility: "unlisted", is_catalog_listed: false }),
  ),
  false,
);
assert.equal(
  isPublicStudioMusicInventory(
    publication({
      catalog_visibility: "selected_users",
      is_catalog_listed: false,
    }),
  ),
  false,
);
assert.equal(
  isPublicStudioMusicInventory(listedAllowed, { commerciallyAccessible: false }),
  false,
);

assert.equal(isStudioMusicListedVisibilityRow(listedAllowed), true);
assert.equal(
  isStudioMusicListedVisibilityRow({
    catalog_visibility: null,
    is_catalog_listed: true,
  }),
  true,
);
assert.equal(
  isStudioMusicListedVisibilityRow({
    catalog_visibility: null,
    is_catalog_listed: null,
  }),
  true,
);
assert.equal(
  isPublicStudioMusicInventory(
    publication({ catalog_visibility: null, is_catalog_listed: true }),
  ),
  true,
);
assert.equal(
  isPublicStudioMusicInventory(
    publication({ catalog_visibility: null, is_catalog_listed: null }),
  ),
  true,
);
assert.equal(
  isPublicStudioMusicInventory(
    publication({ catalog_visibility: null, is_catalog_listed: false }),
  ),
  false,
);
assert.equal(
  isStudioMusicListedVisibilityRow({
    catalog_visibility: null,
    is_catalog_listed: false,
  }),
  false,
);
assert.equal(
  isStudioMusicListedVisibilityRow({
    catalog_visibility: "unlisted",
    is_catalog_listed: false,
  }),
  false,
);
assert.equal(
  isStudioMusicListedVisibilityRow({
    catalog_visibility: "selected_users",
    is_catalog_listed: false,
  }),
  false,
);
assert.equal(
  isPublicStudioMusicInventory(
    publication({
      catalog_visibility: "selected_users",
      is_catalog_listed: true,
    }),
  ),
  false,
);

const listedOr = studioMusicListedVisibilityOrFilter();
assert.match(listedOr, /catalog_visibility\.eq\.listed/);
assert.match(listedOr, /catalog_visibility\.is\.null,is_catalog_listed\.eq\.true/);
assert.match(listedOr, /catalog_visibility\.is\.null,is_catalog_listed\.is\.null/);
assert.doesNotMatch(listedOr, /selected_users/);
assert.doesNotMatch(listedOr, /unlisted/);

const freeListed = publication({
  id: "22222222-2222-4222-8222-222222222222",
  is_free: true,
  price: 0,
  studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FREE,
  studio_music_price_minor: null,
  title: "Тишина",
});
assert.equal(isFreePublicStudioMusicInventory(freeListed), true);
assert.equal(isFreePublicStudioMusicInventory(listedAllowed), false);
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
assert.equal(
  isFreePublicStudioMusicInventory(
    publication({ is_free: true, music_usage_permission: "listen_only" }),
  ),
  false,
);
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
assert.equal(
  studioMusicCatalogFreeOrFilter(),
  "studio_music_pricing_mode.eq.free,and(studio_music_pricing_mode.is.null,is_free.eq.true),and(studio_music_pricing_mode.is.null,price.is.null),and(studio_music_pricing_mode.is.null,price.lte.0)",
);

assert.equal(
  isMineStudioMusicPublication({
    practice: publication({ status: "unpublished", music_usage_permission: "listen_only" }),
    entitlement: { practice_id: listedAllowed.id, revoked_at: null, grant_source: "purchase" },
  }),
  true,
);
assert.equal(
  isMineStudioMusicPublication({
    practice: publication({
      catalog_visibility: "unlisted",
      is_catalog_listed: false,
    }),
    entitlement: { practice_id: listedAllowed.id, revoked_at: null, grant_source: "free" },
  }),
  true,
);
assert.equal(
  isMineStudioMusicPublication({
    practice: publication({ music_usage_permission: "listen_only" }),
    isAuthorMember: true,
  }),
  true,
);
assert.equal(
  isMineStudioMusicPublication({
    practice: listedAllowed,
    entitlement: { revoked_at: "2026-09-01T00:00:00.000Z", grant_source: "purchase" },
  }),
  false,
);
assert.equal(
  isMineStudioMusicPublication({
    practice: listedAllowed,
    entitlement: null,
    isAuthorMember: false,
  }),
  false,
);

const paidOwnership = resolveStudioMusicOwnership({
  practice: listedAllowed,
  commerciallyAccessible: true,
});
assert.equal(paidOwnership.can_acquire, true);
assert.equal(paidOwnership.can_use, false);
assert.equal(paidOwnership.is_owned, false);

const purchased = resolveStudioMusicOwnership({
  practice: listedAllowed,
  entitlement: { revoked_at: null, grant_source: "purchase" },
});
assert.equal(purchased.can_use, true);
assert.equal(purchased.is_owned, true);
assert.equal(purchased.can_acquire, false);
assert.equal(
  resolveStudioMusicDisplayLabel({
    ownership: purchased,
    isFree: false,
    studioEffectiveMinor: 100000,
  }),
  "Доступно в Студии",
);

const authorOnly = resolveStudioMusicOwnership({
  practice: listedAllowed,
  isAuthorMember: true,
});
assert.equal(authorOnly.grant_source, "owner");
assert.equal(authorOnly.is_owned, false);
assert.equal(
  resolveStudioMusicDisplayLabel({
    ownership: authorOnly,
    isFree: false,
    studioEffectiveMinor: 100000,
  }),
  "Ваша музыка",
);

assert.equal(
  resolveStudioMusicDisplayLabel({
    ownership: paidOwnership,
    isFree: true,
    studioEffectiveMinor: null,
  }),
  "Бесплатно",
);
assert.match(
  resolveStudioMusicDisplayLabel({
    ownership: paidOwnership,
    isFree: false,
    studioEffectiveMinor: 100000,
  }),
  /Для Студии/,
);
assert.equal(studioLicenseAmountMinor(50000), 100000);
assert.match(formatStudioCatalogPriceLabel(100000) ?? "", /1\s?000/);

assert.equal(resolveStudioMusicKind(1), "single");
assert.equal(resolveStudioMusicKind(2), "album");

const albumItem = mapStudioMusicCatalogItem({
  practice: listedAllowed,
  tracks: [
    { id: "track-1", title: "A", durationSeconds: 80 },
    { id: "track-2", title: "B", durationSeconds: 90 },
  ],
  ownership: paidOwnership,
  listenerEffectiveMinor: 50000,
});
assert.equal(albumItem.kind, "album");
assert.equal(albumItem.items_count, 2);
assert.equal(albumItem.tracks.length, 2);
assert.equal(albumItem.duration_seconds, null);
assert.equal(albumItem.listener_effective_minor, 50000);
assert.equal(albumItem.studio_effective_minor, 100000);
assert.equal(albumItem.studio_effective_minor, studioLicenseAmountMinor(50000));
assert.equal(albumItem.listener_is_free, false);
assert.equal(albumItem.studio_is_free, false);
assert.equal(albumItem.studio_pricing_mode, STUDIO_MUSIC_PRICING_MODE.AUTO_2X_LISTENER);
assert.match(albumItem.listener_price_label, /Прослушивание/);
assert.match(albumItem.studio_price_label, /Для Студии/);
assert.equal(
  studioMusicCatalogDtoContainsForbiddenFields(albumItem),
  false,
);

const leaked = mapStudioMusicCatalogItem({
  practice: listedAllowed,
  tracks: [{ id: "track-1", title: "A", durationSeconds: 80 }],
  ownership: paidOwnership,
  listenerEffectiveMinor: 50000,
});
assert.equal(
  studioMusicCatalogDtoContainsForbiddenFields({
    ...leaked,
    audio_path: "music/file.mp3",
  }),
  true,
);

const PUBLIC_COVER_URL =
  "https://audiolad.ru/storage/v1/object/public/practice-covers/practices/43bde74b-0767-448b-9ec3-e01e22b616f3/variants/681f1a2e-ff4b-4e63-b086-d4b4d176104d/md.webp";
const ORDINARY_CDN_COVER_URL = "https://cdn.audiolad.ru/covers/dawn.webp";
const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.local";

function coverDto(url: string | null) {
  return { items: [{ cover: { url } }] };
}

assert.equal(
  studioMusicCatalogDtoContainsForbiddenFields(coverDto(PUBLIC_COVER_URL)),
  false,
  "public practice-covers cover.url must not be forbidden",
);
assert.equal(
  studioMusicCatalogDtoContainsForbiddenFields(
    coverDto(`${PUBLIC_COVER_URL}?v=2026-09-10T06%3A40%3A34.732Z`),
  ),
  false,
);

const helperCoverUrl = getCoverPublicUrl(
  "practices/43bde74b-0767-448b-9ec3-e01e22b616f3/cover.webp",
);
assert.match(helperCoverUrl, /\/storage\/v1\/object\/public\/practice-covers\//);
assert.equal(
  studioMusicCatalogDtoContainsForbiddenFields(coverDto(helperCoverUrl)),
  false,
  "getCoverPublicUrl output must be allowed on cover.url",
);

const pipelineCoverUrl = getProductCoverDisplayUrl(
  null,
  "2026-09-10T06:40:34.732Z",
  {
    version: 1,
    versionId: "v1",
    profile: "product-cover",
    sourceWidth: 1000,
    sourceHeight: 1000,
    variants: {
      md: {
        path: "practices/43bde74b-0767-448b-9ec3-e01e22b616f3/variants/681f1a2e-ff4b-4e63-b086-d4b4d176104d/md.webp",
        width: 360,
        height: 360,
        byteSize: 1200,
        mimeType: "image/webp",
      },
    },
  },
  360,
);
assert.ok(pipelineCoverUrl);
assert.match(
  pipelineCoverUrl,
  /\/storage\/v1\/object\/public\/practice-covers\//,
);
assert.equal(
  studioMusicCatalogDtoContainsForbiddenFields(coverDto(pipelineCoverUrl)),
  false,
  "cover-display pipeline URL must be allowed on cover.url",
);

assert.equal(
  studioMusicCatalogDtoContainsForbiddenFields(coverDto(ORDINARY_CDN_COVER_URL)),
  false,
  "ordinary https CDN cover.url must not be forbidden",
);
assert.equal(
  studioMusicCatalogDtoContainsForbiddenFields(
    coverDto("https://cdn.audiolad.ru/practice-audio/full.mp3"),
  ),
  true,
);
assert.equal(
  studioMusicCatalogDtoContainsForbiddenFields(
    coverDto(
      "https://example.supabase.local/storage/v1/object/public/practice-audio/full.mp3",
    ),
  ),
  true,
);
assert.equal(
  studioMusicCatalogDtoContainsForbiddenFields(
    coverDto(
      "https://example.supabase.local/storage/v1/object/sign/practice-covers/secret.webp",
    ),
  ),
  true,
);
assert.equal(
  studioMusicCatalogDtoContainsForbiddenFields(
    coverDto(`${PUBLIC_COVER_URL}?token=leak`),
  ),
  true,
);
assert.equal(
  studioMusicCatalogDtoContainsForbiddenFields({
    cover: { url: PUBLIC_COVER_URL },
    audio_path: "music/file.mp3",
  }),
  true,
);
assert.equal(
  studioMusicCatalogDtoContainsForbiddenFields({
    cover: { url: PUBLIC_COVER_URL },
    signedUrl: "https://example.supabase.local/storage/v1/object/sign/x",
  }),
  true,
);
assert.equal(
  studioMusicCatalogDtoContainsForbiddenFields({
    url: PUBLIC_COVER_URL,
  }),
  true,
  "public cover storage must not be allowed outside cover.url",
);
assert.equal(
  studioMusicCatalogDtoContainsForbiddenFields({
    leak: PUBLIC_COVER_URL,
  }),
  true,
);

if (previousSupabaseUrl === undefined) {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
} else {
  process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
}

const ranked = [
  { id: "b", sortTimestamp: 20 },
  { id: "a", sortTimestamp: 10 },
];
assert.deepEqual(
  applyStudioMusicCatalogCursor(ranked, { sortTimestamp: 20, id: "b" }),
  [{ id: "a", sortTimestamp: 10 }],
);
assert.equal(
  paginateStudioMusicCatalogItems(ranked, 1).nextCursor,
  encodeStudioMusicCatalogCursor(20, "b"),
);

function rankPublications(practices: StudioMusicCatalogPublication[]) {
  return [...practices]
    .map((practice) => ({
      practice,
      id: String(practice.id),
      sortTimestamp: studioMusicCatalogSortTimestamp(practice),
    }))
    .sort((left, right) => {
      if (right.sortTimestamp !== left.sortTimestamp) {
        return right.sortTimestamp - left.sortTimestamp;
      }
      return right.id.localeCompare(left.id);
    });
}

function pagePublications(
  practices: StudioMusicCatalogPublication[],
  cursor: string | null,
  limit: number,
) {
  const after = applyStudioMusicCatalogCursor(
    rankPublications(practices),
    decodeStudioMusicCatalogCursor(cursor),
  );
  return takeStudioMusicCatalogPage(
    after.map((entry) => entry.practice),
    limit,
  );
}

function createStore(input: {
  publicItems?: StudioMusicCatalogPublication[];
  mine?: {
    practices: StudioMusicCatalogPublication[];
    entitlements: Array<{
      practice_id: string;
      grant_source?: string | null;
      revoked_at?: string | null;
    }>;
    authorMemberAuthorIds: string[];
  };
  prices?: Map<string, { listenerEffectiveMinor: number | null }>;
  tracks?: Map<string, Array<{ id: string; title: string; durationSeconds: number | null }>>;
  viewerAccess?: {
    entitlements: Array<{
      practice_id: string;
      grant_source?: string | null;
      revoked_at?: string | null;
    }>;
    authorMemberAuthorIds: string[];
  };
  authorsWithCurrentTerms?: Set<string>;
}): StudioMusicCatalogStore {
  return {
    async listPublicInventory({ filter, cursor, limit, q = null }) {
      const words = studioMusicCatalogSearchWords(q);
      const rows = (input.publicItems ?? []).filter((item) => {
        if (filter === "free" && !isFreePublicStudioMusicInventory(item)) {
          return false;
        }
        if (filter === "paid" && !isPaidPublicStudioMusicInventory(item)) {
          return false;
        }
        return matchesStudioMusicCatalogSearch(item, words);
      });
      return pagePublications(rows, cursor, limit);
    },
    async listMine({ cursor, limit, q = null }) {
      const mine = input.mine ?? {
        practices: [],
        entitlements: [],
        authorMemberAuthorIds: [],
      };
      const words = studioMusicCatalogSearchWords(q);
      const practices = mine.practices.filter((item) =>
        matchesStudioMusicCatalogSearch(item, words),
      );
      return {
        ...pagePublications(practices, cursor, limit),
        entitlements: mine.entitlements,
        authorMemberAuthorIds: mine.authorMemberAuthorIds,
      };
    },
    async loadViewerAccess() {
      return (
        input.viewerAccess ?? {
          entitlements: [],
          authorMemberAuthorIds: [],
        }
      );
    },
    async loadPublishedTracks(practiceIds) {
      return practiceIds.flatMap((id) =>
        (input.tracks?.get(id) ?? [{ id: `${id}-t1`, title: "Трек", durationSeconds: 60 }]).map(
          (track, index) => ({
            id: track.id,
            practiceId: id,
            title: track.title,
            position: index,
            durationSeconds: track.durationSeconds,
            coverUrl: null,
            coverImage: null,
            updatedAt: null,
          }),
        ),
      );
    },
    async loadTracksForMine(practiceIds) {
      return this.loadPublishedTracks(practiceIds);
    },
    async resolveCheckoutPrices(practiceIds) {
      const prices = new Map<string, { listenerEffectiveMinor: number | null }>();
      for (const id of practiceIds) {
        prices.set(
          id,
          input.prices?.get(id) ?? { listenerEffectiveMinor: 50000 },
        );
      }
      return prices;
    },
    async loadAuthorsWithCurrentTerms() {
      return input.authorsWithCurrentTerms ?? new Set(["author-1"]);
    },
  };
}

const guestAll = await handleStudioMusicCatalog({
  filter: "all",
  cursor: null,
  limit: "20",
  userId: null,
  store: createStore({ publicItems: [listedAllowed, freeListed] }),
});
assert.equal(guestAll.status, 200);
assert.equal("items" in guestAll.body && guestAll.body.items.length, 2);
assert.equal("viewer" in guestAll.body && guestAll.body.viewer.authenticated, false);

const publicCoverPublication = publication({
  cover_url: PUBLIC_COVER_URL,
  updated_at: "2026-09-10T06:40:34.732Z",
});
const guestAllWithCover = await handleStudioMusicCatalog({
  filter: "all",
  cursor: null,
  limit: "20",
  userId: null,
  store: createStore({ publicItems: [publicCoverPublication] }),
});
assert.equal(guestAllWithCover.status, 200);
assert.ok("items" in guestAllWithCover.body);
assert.equal(guestAllWithCover.body.items.length, 1);
assert.match(
  guestAllWithCover.body.items[0]?.cover.url ?? "",
  /\/storage\/v1\/object\/public\/practice-covers\//,
);
assert.equal(
  studioMusicCatalogDtoContainsForbiddenFields(guestAllWithCover.body),
  false,
);

const guestFree = await handleStudioMusicCatalog({
  filter: "free",
  cursor: null,
  limit: "20",
  userId: null,
  store: createStore({ publicItems: [listedAllowed, freeListed] }),
});
assert.equal(guestFree.status, 200);
assert.equal("items" in guestFree.body && guestFree.body.items.length, 1);
assert.equal(
  "items" in guestFree.body && guestFree.body.items[0]?.publication_id,
  freeListed.id,
);

const publicViewerEntitlement = await handleStudioMusicCatalog({
  filter: "all",
  cursor: null,
  limit: "20",
  userId: "user-1",
  store: createStore({
    publicItems: [freeListed],
    viewerAccess: {
      entitlements: [
        {
          practice_id: freeListed.id!,
          grant_source: "free",
          revoked_at: null,
        },
      ],
      authorMemberAuthorIds: [],
    },
  }),
});
assert.equal(publicViewerEntitlement.status, 200);
assert.equal(
  "items" in publicViewerEntitlement.body &&
    publicViewerEntitlement.body.items[0]?.ownership.can_use,
  true,
  "an authenticated public-catalog viewer must retain active Studio entitlement",
);
assert.equal(
  "items" in publicViewerEntitlement.body &&
    publicViewerEntitlement.body.items[0]?.ownership.can_acquire,
  false,
);

const blockedWithoutCurrentAuthorTerms = await handleStudioMusicCatalog({
  filter: "all",
  cursor: null,
  limit: "20",
  userId: "user-1",
  store: createStore({
    publicItems: [listedAllowed],
    authorsWithCurrentTerms: new Set(),
  }),
});
assert.equal(blockedWithoutCurrentAuthorTerms.status, 200);
assert.equal(
  "items" in blockedWithoutCurrentAuthorTerms.body &&
    blockedWithoutCurrentAuthorTerms.body.items[0]?.ownership
      .acquisition_unavailable_reason,
  "author_terms_not_accepted",
);
assert.equal(
  "items" in blockedWithoutCurrentAuthorTerms.body &&
    blockedWithoutCurrentAuthorTerms.body.items[0]?.ownership.can_acquire,
  false,
);


// FREE Studio music must be acquirable without current source-author terms.
const freeWithoutCurrentAuthorTerms = resolveStudioMusicOwnership({
  practice: freeListed,
  commerciallyAccessible: true,
  authorHasCurrentTerms: false,
});
assert.equal(freeWithoutCurrentAuthorTerms.can_acquire, true);
assert.equal(freeWithoutCurrentAuthorTerms.acquisition_unavailable_reason, null);

const freeWithCurrentAuthorTerms = resolveStudioMusicOwnership({
  practice: freeListed,
  commerciallyAccessible: true,
  authorHasCurrentTerms: true,
});
assert.equal(freeWithCurrentAuthorTerms.can_acquire, true);
assert.equal(freeWithCurrentAuthorTerms.acquisition_unavailable_reason, null);

// PAID without terms remains blocked.
const paidWithoutCurrentAuthorTerms = resolveStudioMusicOwnership({
  practice: listedAllowed,
  commerciallyAccessible: true,
  authorHasCurrentTerms: false,
});
assert.equal(paidWithoutCurrentAuthorTerms.can_acquire, false);
assert.equal(
  paidWithoutCurrentAuthorTerms.acquisition_unavailable_reason,
  "author_terms_not_accepted",
);

const paidWithCurrentAuthorTerms = resolveStudioMusicOwnership({
  practice: listedAllowed,
  commerciallyAccessible: true,
  authorHasCurrentTerms: true,
});
assert.equal(paidWithCurrentAuthorTerms.can_acquire, true);
assert.equal(paidWithCurrentAuthorTerms.acquisition_unavailable_reason, null);

// FREE but not platform_reuse_allowed → unavailable (not a terms reason).
const freeListenOnly = resolveStudioMusicOwnership({
  practice: publication({
    ...freeListed,
    music_usage_permission: "listen_only",
  }),
  commerciallyAccessible: true,
  authorHasCurrentTerms: false,
});
assert.equal(freeListenOnly.can_acquire, false);
assert.equal(freeListenOnly.acquisition_unavailable_reason, null);

// FREE unpublished / deleted → unavailable.
assert.equal(
  resolveStudioMusicOwnership({
    practice: publication({ ...freeListed, status: "draft" }),
    commerciallyAccessible: true,
    authorHasCurrentTerms: false,
  }).can_acquire,
  false,
);
assert.equal(
  resolveStudioMusicOwnership({
    practice: publication({
      ...freeListed,
      deleted_at: "2026-09-01T00:00:00.000Z",
    }),
    commerciallyAccessible: true,
    authorHasCurrentTerms: false,
  }).can_acquire,
  false,
);

// FREE but commercial accessibility disabled → unavailable.
assert.equal(
  resolveStudioMusicOwnership({
    practice: freeListed,
    commerciallyAccessible: false,
    authorHasCurrentTerms: false,
  }).can_acquire,
  false,
);

// Listener-free + Studio fixed paid → PAID for Studio; terms still required.
const listenerFreeStudioPaid = publication({
  is_free: true,
  price: 0,
  studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FIXED,
  studio_music_price_minor: 19900,
});
const listenerFreeStudioPaidNoTerms = resolveStudioMusicOwnership({
  practice: listenerFreeStudioPaid,
  commerciallyAccessible: true,
  authorHasCurrentTerms: false,
});
assert.equal(listenerFreeStudioPaidNoTerms.can_acquire, false);
assert.equal(
  listenerFreeStudioPaidNoTerms.acquisition_unavailable_reason,
  "author_terms_not_accepted",
);
assert.equal(
  resolveStudioMusicOwnership({
    practice: listenerFreeStudioPaid,
    commerciallyAccessible: true,
    authorHasCurrentTerms: true,
  }).can_acquire,
  true,
);

// Existing entitlement / author-own use without terms remains usable.
assert.equal(
  resolveStudioMusicOwnership({
    practice: freeListed,
    entitlement: { revoked_at: null, grant_source: "free" },
    authorHasCurrentTerms: false,
  }).can_use,
  true,
);
assert.equal(
  resolveStudioMusicOwnership({
    practice: listedAllowed,
    isAuthorMember: true,
    authorHasCurrentTerms: false,
  }).can_use,
  true,
);

// Catalog handler: FREE without source-author terms → can_acquire for any viewer path.
const freeCatalogNoTerms = await handleStudioMusicCatalog({
  filter: "all",
  cursor: null,
  limit: "20",
  userId: "user-ordinary",
  store: createStore({
    publicItems: [freeListed, listedAllowed],
    authorsWithCurrentTerms: new Set(),
  }),
});
assert.equal(freeCatalogNoTerms.status, 200);
assert.equal(
  "items" in freeCatalogNoTerms.body &&
    freeCatalogNoTerms.body.items.find((i) => i.publication_id === freeListed.id)
      ?.ownership.can_acquire,
  true,
);
assert.equal(
  "items" in freeCatalogNoTerms.body &&
    freeCatalogNoTerms.body.items.find((i) => i.publication_id === freeListed.id)
      ?.ownership.acquisition_unavailable_reason,
  null,
);
assert.equal(
  "items" in freeCatalogNoTerms.body &&
    freeCatalogNoTerms.body.items.find((i) => i.publication_id === listedAllowed.id)
      ?.ownership.can_acquire,
  false,
);
assert.equal(
  "items" in freeCatalogNoTerms.body &&
    freeCatalogNoTerms.body.items.find((i) => i.publication_id === listedAllowed.id)
      ?.ownership.acquisition_unavailable_reason,
  "author_terms_not_accepted",
);

// Guest catalog (no userId): ownership flags still computed from source-author terms.
const guestCatalogNoTerms = await handleStudioMusicCatalog({
  filter: "all",
  cursor: null,
  limit: "20",
  userId: null,
  store: createStore({
    publicItems: [freeListed, listedAllowed],
    authorsWithCurrentTerms: new Set(),
  }),
});
assert.equal(guestCatalogNoTerms.status, 200);
assert.equal(
  "items" in guestCatalogNoTerms.body &&
    guestCatalogNoTerms.body.items.find((i) => i.publication_id === freeListed.id)
      ?.ownership.can_acquire,
  true,
);
assert.equal(
  "items" in guestCatalogNoTerms.body &&
    guestCatalogNoTerms.body.items.find((i) => i.publication_id === listedAllowed.id)
      ?.ownership.can_acquire,
  false,
);


const entitledWithoutCurrentAuthorTerms = await handleStudioMusicCatalog({
  filter: "all",
  cursor: null,
  limit: "20",
  userId: "user-1",
  store: createStore({
    publicItems: [listedAllowed],
    authorsWithCurrentTerms: new Set(),
    viewerAccess: {
      entitlements: [
        {
          practice_id: listedAllowed.id!,
          grant_source: "purchase",
          revoked_at: null,
        },
      ],
      authorMemberAuthorIds: [],
    },
  }),
});
assert.equal(entitledWithoutCurrentAuthorTerms.status, 200);
assert.equal(
  "items" in entitledWithoutCurrentAuthorTerms.body &&
    entitledWithoutCurrentAuthorTerms.body.items[0]?.ownership.can_use,
  true,
);

const freeViewerEntitlement = await handleStudioMusicCatalog({
  filter: "free",
  cursor: null,
  limit: "20",
  userId: "user-1",
  store: createStore({
    publicItems: [freeListed],
    viewerAccess: {
      entitlements: [
        {
          practice_id: freeListed.id!,
          grant_source: "free",
          revoked_at: null,
        },
      ],
      authorMemberAuthorIds: [],
    },
  }),
});
assert.equal(freeViewerEntitlement.status, 200);
assert.equal(
  "items" in freeViewerEntitlement.body &&
    freeViewerEntitlement.body.items[0]?.ownership.can_use,
  true,
);
assert.equal(
  "items" in freeViewerEntitlement.body &&
    freeViewerEntitlement.body.items[0]?.ownership.can_acquire,
  false,
);

const publicViewerAuthor = await handleStudioMusicCatalog({
  filter: "all",
  cursor: null,
  limit: "20",
  userId: "user-1",
  store: createStore({
    publicItems: [listedAllowed],
    viewerAccess: { entitlements: [], authorMemberAuthorIds: ["author-1"] },
  }),
});
assert.equal(publicViewerAuthor.status, 200);
assert.equal(
  "items" in publicViewerAuthor.body &&
    publicViewerAuthor.body.items[0]?.ownership.is_author_member,
  true,
);
assert.equal(
  "items" in publicViewerAuthor.body &&
    publicViewerAuthor.body.items[0]?.ownership.can_use,
  true,
);

const freeViewerAuthor = await handleStudioMusicCatalog({
  filter: "free",
  cursor: null,
  limit: "20",
  userId: "user-1",
  store: createStore({
    publicItems: [freeListed],
    viewerAccess: { entitlements: [], authorMemberAuthorIds: ["author-1"] },
  }),
});
assert.equal(freeViewerAuthor.status, 200);
assert.equal(
  "items" in freeViewerAuthor.body &&
    freeViewerAuthor.body.items[0]?.ownership.is_author_member,
  true,
);
assert.equal(
  "items" in freeViewerAuthor.body &&
    freeViewerAuthor.body.items[0]?.ownership.can_use,
  true,
);

const acquireThenFreshReload = await handleStudioMusicCatalog({
  filter: "all",
  cursor: null,
  limit: "20",
  userId: "user-1",
  store: createStore({
    publicItems: [freeListed],
    viewerAccess: {
      entitlements: [
        {
          practice_id: freeListed.id!,
          grant_source: "free",
          revoked_at: null,
        },
      ],
      authorMemberAuthorIds: [],
    },
  }),
});
assert.equal(acquireThenFreshReload.status, 200);
assert.equal(
  "items" in acquireThenFreshReload.body &&
    acquireThenFreshReload.body.items[0]?.ownership.can_use,
  true,
  "a fresh public-catalog reload after free acquisition must remain available",
);

const listenerFreeStudioFixed = publication({
  id: "44444444-4444-4444-8444-444444444444",
  is_free: true,
  price: 0,
  studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FIXED,
  studio_music_price_minor: 60000,
  title: "Фикс",
});
const listenerPaidStudioFree = publication({
  id: "55555555-5555-4555-8555-555555555555",
  is_free: false,
  price: 300,
  studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FREE,
  title: "Студия бесплатно",
});
const guestFreeIndependent = await handleStudioMusicCatalog({
  filter: "free",
  cursor: null,
  limit: "20",
  userId: null,
  store: createStore({
    publicItems: [listenerFreeStudioFixed, listenerPaidStudioFree],
    prices: new Map([
      [listenerFreeStudioFixed.id!, { listenerEffectiveMinor: null }],
      [listenerPaidStudioFree.id!, { listenerEffectiveMinor: 30000 }],
    ]),
  }),
});
assert.equal(guestFreeIndependent.status, 200);
assert.ok("items" in guestFreeIndependent.body);
assert.equal(guestFreeIndependent.body.items.length, 1);
assert.equal(
  guestFreeIndependent.body.items[0]?.publication_id,
  listenerPaidStudioFree.id,
);
assert.equal(guestFreeIndependent.body.items[0]?.studio_is_free, true);
assert.equal(guestFreeIndependent.body.items[0]?.listener_is_free, false);

const guestMine = await handleStudioMusicCatalog({
  filter: "mine",
  cursor: null,
  limit: "20",
  userId: null,
  store: createStore({}),
});
assert.deepEqual(guestMine, { status: 401, body: { error: "unauthorized" } });

const unpublishedOwned = publication({
  id: "33333333-3333-4333-8333-333333333333",
  status: "unpublished",
  music_usage_permission: "listen_only",
  catalog_visibility: "unlisted",
  is_catalog_listed: false,
  title: "Снятая",
});
const mine = await handleStudioMusicCatalog({
  filter: "mine",
  cursor: null,
  limit: "20",
  userId: "user-1",
  store: createStore({
    mine: {
      practices: [unpublishedOwned],
      entitlements: [
        {
          practice_id: unpublishedOwned.id!,
          grant_source: "purchase",
          revoked_at: null,
        },
      ],
      authorMemberAuthorIds: [],
    },
  }),
});
assert.equal(mine.status, 200);
assert.equal("items" in mine.body && mine.body.items.length, 1);
assert.equal(
  "items" in mine.body && mine.body.items[0]?.display_label,
  "Доступно в Студии",
);

const authorMine = await handleStudioMusicCatalog({
  filter: "mine",
  cursor: null,
  limit: "20",
  userId: "user-1",
  store: createStore({
    mine: {
      practices: [publication({ music_usage_permission: "listen_only" })],
      entitlements: [],
      authorMemberAuthorIds: ["author-1"],
    },
  }),
});
assert.equal(authorMine.status, 200);
assert.equal(
  "items" in authorMine.body && authorMine.body.items[0]?.display_label,
  "Ваша музыка",
);

const revoked = await handleStudioMusicCatalog({
  filter: "mine",
  cursor: null,
  limit: "20",
  userId: "user-1",
  store: createStore({
    mine: {
      practices: [listedAllowed],
      entitlements: [
        {
          practice_id: listedAllowed.id!,
          grant_source: "purchase",
          revoked_at: "2026-09-01T00:00:00.000Z",
        },
      ],
      authorMemberAuthorIds: [],
    },
  }),
});
assert.equal(revoked.status, 200);
assert.equal("items" in revoked.body && revoked.body.items.length, 0);


const paidFixed = publication({
  id: "33333333-3333-4333-8333-333333333333",
  is_free: true,
  price: 0,
  studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FIXED,
  studio_music_price_minor: 99000,
  title: "Платный фикс",
  subtitle: "для студии",
});
const paidAuto = publication({
  id: "44444444-4444-4444-8444-444444444444",
  is_free: false,
  price: 200,
  studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.AUTO_2X_LISTENER,
  studio_music_price_minor: null,
  title: "Авто удвоение",
});
const paidLegacy = publication({
  id: "55555555-5555-4555-8555-555555555555",
  is_free: false,
  price: 350,
  studio_music_pricing_mode: null,
  studio_music_price_minor: null,
  title: "Легаси платный",
});
assert.equal(isPaidPublicStudioMusicInventory(paidFixed), true);
assert.equal(isPaidPublicStudioMusicInventory(paidAuto), true);
assert.equal(isPaidPublicStudioMusicInventory(paidLegacy), true);
assert.equal(isPaidPublicStudioMusicInventory(freeListed), false);
assert.equal(isPaidPublicStudioMusicInventory(listedAllowed), true);
assert.equal(
  isPaidPublicStudioMusicInventory(
    publication({
      is_free: true,
      price: 0,
      studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FIXED,
      studio_music_price_minor: 0,
    }),
  ),
  false,
);

const paidOr = studioMusicCatalogPaidOrFilter();
assert.match(paidOr, /studio_music_pricing_mode\.eq\.fixed,studio_music_price_minor\.gt\.0/);
assert.match(paidOr, /studio_music_pricing_mode\.eq\.auto_2x_listener/);
assert.match(paidOr, /studio_music_pricing_mode\.is\.null,is_free\.eq\.false,price\.gt\.0/);

assert.equal(
  matchesStudioMusicCatalogSearch({ title: "Тихий Рассвет", subtitle: "утро" }, ["тихий", "рассвет"]),
  true,
);
assert.equal(
  matchesStudioMusicCatalogSearch({ title: "Тихий Рассвет", subtitle: null }, ["вечер"]),
  false,
);
assert.equal(
  matchesStudioMusicCatalogSearch({ title: "Альбом", subtitle: "Кириллица тест" }, ["кириллица"]),
  true,
);

const guestPaid = await handleStudioMusicCatalog({
  filter: "paid",
  cursor: null,
  limit: "20",
  userId: null,
  store: createStore({
    publicItems: [listedAllowed, freeListed, paidFixed, paidAuto, paidLegacy],
  }),
});
assert.equal(guestPaid.status, 200);
assert.equal("items" in guestPaid.body && guestPaid.body.items.length, 4);
assert.equal(
  "items" in guestPaid.body &&
    guestPaid.body.items.every((item) => item.publication_id !== freeListed.id),
  true,
);

const searchTitle = await handleStudioMusicCatalog({
  filter: "all",
  cursor: null,
  limit: "20",
  q: "  Рассвет  ",
  userId: null,
  store: createStore({ publicItems: [listedAllowed, freeListed, paidFixed] }),
});
assert.equal(searchTitle.status, 200);
assert.equal("items" in searchTitle.body && searchTitle.body.items.length, 1);
assert.equal(
  "items" in searchTitle.body && searchTitle.body.items[0]?.title,
  "Рассвет",
);

const searchMulti = await handleStudioMusicCatalog({
  filter: "paid",
  cursor: null,
  limit: "20",
  q: "платный фикс",
  userId: null,
  store: createStore({ publicItems: [listedAllowed, freeListed, paidFixed, paidAuto] }),
});
assert.equal(searchMulti.status, 200);
assert.equal("items" in searchMulti.body && searchMulti.body.items.length, 1);
assert.equal(
  "items" in searchMulti.body && searchMulti.body.items[0]?.title,
  "Платный фикс",
);

const searchEmpty = await handleStudioMusicCatalog({
  filter: "all",
  cursor: null,
  limit: "20",
  q: "   ",
  userId: null,
  store: createStore({ publicItems: [listedAllowed, freeListed] }),
});
assert.equal(searchEmpty.status, 200);
assert.equal("items" in searchEmpty.body && searchEmpty.body.items.length, 2);

const searchMiss = await handleStudioMusicCatalog({
  filter: "all",
  cursor: null,
  limit: "20",
  q: "неттакоготрека",
  userId: null,
  store: createStore({ publicItems: [listedAllowed, freeListed] }),
});
assert.equal(searchMiss.status, 200);
assert.equal("items" in searchMiss.body && searchMiss.body.items.length, 0);

const routeSource = read("src/app/api/studio/music/catalog/route.ts");
assert.match(routeSource, /searchParams\.get\(["']q["']\)/);

const catalogSource = read("src/lib/studio-music/catalog.ts");
assert.doesNotMatch(catalogSource, /from\(["']user_practices["']\)/);
assert.doesNotMatch(catalogSource, /\/api\/catalog[/'"`]/);
assert.doesNotMatch(catalogSource, /create_studio_music_order/);
assert.doesNotMatch(catalogSource, /acquire_free_studio_music/);
assert.match(catalogSource, /PRICE_SURFACES\.CHECKOUT/);
assert.match(catalogSource, /resolveStudioMusicAcquisition/);
assert.match(catalogSource, /studio_music_pricing_mode/);
assert.match(catalogSource, /resolvePracticePriceRpc/);
assert.match(catalogSource, /studioMusicListedVisibilityOrFilter/);
assert.match(catalogSource, /studioMusicCatalogFreeOrFilter/);
assert.match(catalogSource, /studioMusicCatalogPaidOrFilter/);
assert.match(catalogSource, /parseStudioMusicCatalogQuery/);
assert.match(catalogSource, /applyStudioMusicCatalogSearch/);
assert.match(catalogSource, /studioMusicCatalogFetchLimit/);
assert.doesNotMatch(catalogSource, /\.eq\(\s*["']catalog_visibility["']\s*,\s*["']listed["']\s*\)/);
assert.doesNotMatch(
  catalogSource,
  /\.eq\(\s*["']studio_music_pricing_mode["']\s*,\s*["']free["']\s*\)/,
);

const overlay = read("src/components/studio/StudioMusicCatalogOverlay.tsx");
assert.doesNotMatch(overlay, /\*\s*2/);
assert.doesNotMatch(overlay, /studio_effective_minor\s*\*/);
assert.match(overlay, /\/api\/studio\/music\/catalog/);
assert.match(overlay, /params\.set\(["']q["'], debouncedQuery\)/);
assert.match(overlay, /Платная/);
assert.match(overlay, /Поиск музыки/);
assert.match(overlay, /Ничего не найдено/);
assert.match(overlay, /SEARCH_DEBOUNCE_MS/);
assert.match(overlay, /\/api\/studio\/music\/preview/);
assert.doesNotMatch(overlay, /\/api\/catalog\/play/);

console.log("studio-music-catalog-unit: ok");
