import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getMusicReleaseLabel,
  MUSIC_USAGE_PERMISSION,
} from "@/lib/author-products/product-kind";
import { isListedCatalogVisibility } from "@/lib/products/catalog-visibility";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import { normalizeDurationSeconds } from "@/lib/products/duration";
import { filterPublicPracticeRows } from "@/lib/fixtures/test-fixture-marker";
import { PRICE_SURFACES } from "@/lib/pricing/types";
import { resolvePracticePriceRpc } from "@/lib/pricing/rpc";
import { formatRubles } from "@/lib/products/price-format";
import {
  groupPublishedAudioItemsByPractice,
  loadPublishedAudioItemsByPracticeIds,
  type PublishedAudioItemDetail,
} from "@/lib/products/public-audio-items";

import {
  canAcquireStudioMusic,
  canUseMusicInStudio,
  hasStudioMusicEntitlement,
  isStudioMusicPublication,
  studioLicenseAmountMinor,
  STUDIO_MUSIC_GRANT_SOURCE,
  type StudioMusicEntitlementInput,
  type StudioMusicGrantSource,
  type StudioMusicPublicationInput,
} from "./access";

export const STUDIO_MUSIC_CATALOG_FILTERS = ["all", "mine", "free"] as const;
export type StudioMusicCatalogFilter =
  (typeof STUDIO_MUSIC_CATALOG_FILTERS)[number];

export const STUDIO_MUSIC_CATALOG_PAGE_SIZE = 20;
export const STUDIO_MUSIC_CATALOG_MAX_LIMIT = 50;

export const STUDIO_MUSIC_CATALOG_KIND = {
  SINGLE: "single",
  ALBUM: "album",
} as const;

export type StudioMusicCatalogKind =
  (typeof STUDIO_MUSIC_CATALOG_KIND)[keyof typeof STUDIO_MUSIC_CATALOG_KIND];

export const STUDIO_MUSIC_DISPLAY_LABEL = {
  FREE: "Бесплатно",
  AVAILABLE: "Доступно в Студии",
  OWN: "Ваша музыка",
} as const;

const FORBIDDEN_DTO_KEYS = [
  "audio_path",
  "audio_url",
  "signedUrl",
  "signed_url",
  "storage_path",
  "full_url",
] as const;

export type StudioMusicCatalogPublication = StudioMusicPublicationInput & {
  author_id?: string | null;
  title?: string | null;
  slug?: string | null;
  catalog_visibility?: string | null;
  is_catalog_listed?: boolean | null;
  cover_url?: string | null;
  cover_image?: unknown;
  updated_at?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  authors?:
    | { name?: string | null; slug?: string | null }
    | { name?: string | null; slug?: string | null }[]
    | null;
};

export type StudioMusicCatalogEntitlement = StudioMusicEntitlementInput & {
  practice_id?: string | null;
  grant_source?: string | null;
};

export type StudioMusicCatalogOwnership = {
  can_acquire: boolean;
  can_use: boolean;
  is_owned: boolean;
  is_author_member: boolean;
  grant_source: StudioMusicGrantSource | null;
};

export type StudioMusicCatalogTrack = {
  id: string;
  title: string;
  duration_seconds: number | null;
};

export type StudioMusicCatalogItem = {
  publication_id: string;
  kind: StudioMusicCatalogKind;
  title: string;
  author: { name: string; slug: string | null };
  cover: { url: string | null };
  duration_seconds: number | null;
  items_count: number;
  tracks: StudioMusicCatalogTrack[];
  is_free: boolean;
  listener_effective_minor: number | null;
  studio_effective_minor: number | null;
  ownership: StudioMusicCatalogOwnership;
  display_label: string;
  kind_label: string;
};

export type StudioMusicCatalogResult = {
  items: StudioMusicCatalogItem[];
  nextCursor: string | null;
  viewer: {
    authenticated: boolean;
    filter: StudioMusicCatalogFilter;
  };
};

export type StudioMusicCatalogHandlerResult = {
  status: number;
  body: StudioMusicCatalogResult | { error: string };
};

export type StudioMusicCatalogStore = {
  listPublicInventory(filter: "all" | "free"): Promise<StudioMusicCatalogPublication[]>;
  listMine(userId: string): Promise<{
    practices: StudioMusicCatalogPublication[];
    entitlements: StudioMusicCatalogEntitlement[];
    authorMemberAuthorIds: string[];
  }>;
  loadPublishedTracks(
    practiceIds: string[],
  ): Promise<PublishedAudioItemDetail[]>;
  loadTracksForMine(practiceIds: string[]): Promise<PublishedAudioItemDetail[]>;
  resolveCheckoutPrices(
    practiceIds: string[],
    userId: string | null,
    visitorId: string | null,
  ): Promise<Map<string, { listenerEffectiveMinor: number | null }>>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isStudioMusicCatalogUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function parseStudioMusicCatalogFilter(
  value: string | null | undefined,
): StudioMusicCatalogFilter | null {
  const normalized = value?.trim().toLowerCase() ?? "all";
  if (
    (STUDIO_MUSIC_CATALOG_FILTERS as readonly string[]).includes(normalized)
  ) {
    return normalized as StudioMusicCatalogFilter;
  }
  return null;
}

export function parseStudioMusicCatalogLimit(
  value: string | null | undefined,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return STUDIO_MUSIC_CATALOG_PAGE_SIZE;
  }
  return Math.min(parsed, STUDIO_MUSIC_CATALOG_MAX_LIMIT);
}

export function encodeStudioMusicCatalogCursor(
  sortTimestamp: number,
  id: string,
): string {
  return `${sortTimestamp}:${id}`;
}

export function decodeStudioMusicCatalogCursor(
  cursor: string | null | undefined,
): { sortTimestamp: number; id: string } | null {
  const raw = cursor?.trim();
  if (!raw) {
    return null;
  }
  const separator = raw.indexOf(":");
  if (separator <= 0) {
    return null;
  }
  const sortTimestamp = Number(raw.slice(0, separator));
  const id = raw.slice(separator + 1).trim();
  if (!id || !Number.isFinite(sortTimestamp)) {
    return null;
  }
  return { sortTimestamp, id };
}

/**
 * Guest-visible commercial access (listed/unlisted published).
 * selected_users is not commercially accessible unless the caller
 * already resolved allowlist/membership and passed true.
 */
export function isCommerciallyAccessibleStudioPublication(
  practice: StudioMusicCatalogPublication,
  options?: { commerciallyAccessible?: boolean },
): boolean {
  if (!practice.id || practice.deleted_at) {
    return false;
  }
  if (practice.status !== "published") {
    return false;
  }
  if (options?.commerciallyAccessible === false) {
    return false;
  }
  if (isListedCatalogVisibility(practice.catalog_visibility, practice.is_catalog_listed)) {
    return true;
  }
  if (practice.catalog_visibility === "unlisted") {
    return true;
  }
  return options?.commerciallyAccessible === true;
}

export function isPubliclyListedStudioPublication(
  practice: StudioMusicCatalogPublication,
): boolean {
  return isListedCatalogVisibility(
    practice.catalog_visibility,
    practice.is_catalog_listed,
  );
}

/**
 * Public Studio vitrine (all / free): published music/release with
 * platform_reuse_allowed, commercially accessible, listed only.
 */
export function isPublicStudioMusicInventory(
  practice: StudioMusicCatalogPublication,
  options?: { commerciallyAccessible?: boolean },
): boolean {
  if (!canAcquireStudioMusic(practice, options)) {
    return false;
  }
  if (!isPubliclyListedStudioPublication(practice)) {
    return false;
  }
  if (!isCommerciallyAccessibleStudioPublication(practice, options)) {
    return false;
  }
  return true;
}

export function isFreePublicStudioMusicInventory(
  practice: StudioMusicCatalogPublication,
  options?: { commerciallyAccessible?: boolean },
): boolean {
  return isPublicStudioMusicInventory(practice, options) && practice.is_free === true;
}

/**
 * Mine: active entitlement OR live author member.
 * Does not re-check status / permission / listed.
 * Never consults user_practices.
 */
export function isMineStudioMusicPublication(input: {
  practice: Pick<
    StudioMusicCatalogPublication,
    "id" | "deleted_at" | "product_kind" | "publication_class"
  >;
  entitlement?: StudioMusicCatalogEntitlement | null;
  isAuthorMember?: boolean;
}): boolean {
  if (!input.practice.id || input.practice.deleted_at) {
    return false;
  }
  if (!isStudioMusicPublication(input.practice)) {
    return false;
  }
  return canUseMusicInStudio({
    entitlement: input.entitlement,
    isAuthorMember: input.isAuthorMember,
  });
}

export function resolveStudioMusicGrantSource(input: {
  entitlement?: StudioMusicCatalogEntitlement | null;
  isAuthorMember?: boolean;
}): StudioMusicGrantSource | null {
  if (hasStudioMusicEntitlement(input.entitlement)) {
    const source = input.entitlement?.grant_source;
    if (source === STUDIO_MUSIC_GRANT_SOURCE.PURCHASE) {
      return STUDIO_MUSIC_GRANT_SOURCE.PURCHASE;
    }
    if (source === STUDIO_MUSIC_GRANT_SOURCE.FREE) {
      return STUDIO_MUSIC_GRANT_SOURCE.FREE;
    }
    if (source === STUDIO_MUSIC_GRANT_SOURCE.OWNER) {
      return STUDIO_MUSIC_GRANT_SOURCE.OWNER;
    }
    return STUDIO_MUSIC_GRANT_SOURCE.PURCHASE;
  }
  if (input.isAuthorMember) {
    return STUDIO_MUSIC_GRANT_SOURCE.OWNER;
  }
  return null;
}

export function resolveStudioMusicOwnership(input: {
  practice: StudioMusicCatalogPublication;
  entitlement?: StudioMusicCatalogEntitlement | null;
  isAuthorMember?: boolean;
  commerciallyAccessible?: boolean;
}): StudioMusicCatalogOwnership {
  const isOwned = hasStudioMusicEntitlement(input.entitlement);
  const isAuthorMember = input.isAuthorMember === true;
  const canUse = canUseMusicInStudio({
    entitlement: input.entitlement,
    isAuthorMember,
  });
  const canAcquire =
    !canUse &&
    canAcquireStudioMusic(input.practice, {
      commerciallyAccessible: input.commerciallyAccessible,
    });

  return {
    can_acquire: canAcquire,
    can_use: canUse,
    is_owned: isOwned,
    is_author_member: isAuthorMember,
    grant_source: resolveStudioMusicGrantSource({
      entitlement: input.entitlement,
      isAuthorMember,
    }),
  };
}

export function formatStudioCatalogPriceLabel(
  studioEffectiveMinor: number | null | undefined,
): string | null {
  if (
    studioEffectiveMinor == null ||
    !Number.isFinite(studioEffectiveMinor) ||
    studioEffectiveMinor <= 0
  ) {
    return null;
  }
  const rubles = Math.trunc(studioEffectiveMinor / 100);
  if (rubles <= 0) {
    return null;
  }
  return `Для Студии — ${formatRubles(rubles)}`;
}

export function resolveStudioMusicDisplayLabel(input: {
  ownership: StudioMusicCatalogOwnership;
  isFree: boolean;
  studioEffectiveMinor: number | null;
}): string {
  if (input.ownership.can_use) {
    if (input.ownership.is_author_member && !input.ownership.is_owned) {
      return STUDIO_MUSIC_DISPLAY_LABEL.OWN;
    }
    return STUDIO_MUSIC_DISPLAY_LABEL.AVAILABLE;
  }
  if (input.isFree) {
    return STUDIO_MUSIC_DISPLAY_LABEL.FREE;
  }
  return (
    formatStudioCatalogPriceLabel(input.studioEffectiveMinor) ?? "Для Студии"
  );
}

export function resolveStudioMusicKind(
  trackCount: number,
): StudioMusicCatalogKind {
  return trackCount >= 2
    ? STUDIO_MUSIC_CATALOG_KIND.ALBUM
    : STUDIO_MUSIC_CATALOG_KIND.SINGLE;
}

export function studioMusicCatalogSortTimestamp(
  practice: StudioMusicCatalogPublication,
): number {
  const published = practice.published_at
    ? Date.parse(practice.published_at)
    : Number.NaN;
  if (Number.isFinite(published)) {
    return published;
  }
  const created = practice.created_at ? Date.parse(practice.created_at) : Number.NaN;
  return Number.isFinite(created) ? created : 0;
}

export function applyStudioMusicCatalogCursor<T extends { sortTimestamp: number; id: string }>(
  items: T[],
  cursor: { sortTimestamp: number; id: string } | null,
): T[] {
  if (!cursor) {
    return items;
  }
  return items.filter((item) => {
    if (item.sortTimestamp < cursor.sortTimestamp) {
      return true;
    }
    if (item.sortTimestamp > cursor.sortTimestamp) {
      return false;
    }
    return item.id < cursor.id;
  });
}

export function paginateStudioMusicCatalogItems<
  T extends { sortTimestamp: number; id: string },
>(items: T[], limit: number): { page: T[]; nextCursor: string | null } {
  const page = items.slice(0, limit);
  const hasMore = items.length > limit;
  const last = page[page.length - 1];
  return {
    page,
    nextCursor:
      hasMore && last
        ? encodeStudioMusicCatalogCursor(last.sortTimestamp, last.id)
        : null,
  };
}

function authorFromJoin(
  authors: StudioMusicCatalogPublication["authors"],
): { name: string; slug: string | null } {
  const row = Array.isArray(authors) ? authors[0] : authors;
  const name = row?.name?.trim() || "Автор";
  const slug = row?.slug?.trim() || null;
  return { name, slug };
}

export function mapStudioMusicCatalogItem(input: {
  practice: StudioMusicCatalogPublication;
  tracks: Array<{ id: string; title: string; durationSeconds: number | null }>;
  ownership: StudioMusicCatalogOwnership;
  listenerEffectiveMinor: number | null;
}): StudioMusicCatalogItem {
  const tracks = [...input.tracks].map((track) => ({
    id: track.id,
    title: track.title.trim() || "Без названия",
    duration_seconds: normalizeDurationSeconds(track.durationSeconds),
  }));
  const kind = resolveStudioMusicKind(tracks.length);
  const isFree = input.practice.is_free === true;
  const studioEffectiveMinor = isFree
    ? null
    : studioLicenseAmountMinor(input.listenerEffectiveMinor);
  const durationSeconds =
    kind === STUDIO_MUSIC_CATALOG_KIND.SINGLE
      ? (tracks[0]?.duration_seconds ?? null)
      : null;

  return {
    publication_id: String(input.practice.id),
    kind,
    title: input.practice.title?.trim() || "Без названия",
    author: authorFromJoin(input.practice.authors),
    cover: {
      url: getProductCoverDisplayUrl(
        input.practice.cover_url,
        input.practice.updated_at,
        input.practice.cover_image,
        360,
      ),
    },
    duration_seconds: durationSeconds,
    items_count: tracks.length,
    tracks,
    is_free: isFree,
    listener_effective_minor: isFree ? null : input.listenerEffectiveMinor,
    studio_effective_minor: studioEffectiveMinor,
    ownership: input.ownership,
    display_label: resolveStudioMusicDisplayLabel({
      ownership: input.ownership,
      isFree,
      studioEffectiveMinor,
    }),
    kind_label: getMusicReleaseLabel(tracks.length),
  };
}

export function studioMusicCatalogDtoContainsForbiddenFields(
  value: unknown,
): boolean {
  if (Array.isArray(value)) {
    return value.some(studioMusicCatalogDtoContainsForbiddenFields);
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (
      (FORBIDDEN_DTO_KEYS as readonly string[]).includes(key) ||
      /audio_path|signedUrl|storage_path/i.test(key)
    ) {
      return true;
    }
    if (typeof nested === "string") {
      if (
        nested.includes("/storage/v1/object") ||
        nested.includes("practice-audio/") ||
        nested.startsWith("http://") ||
        nested.startsWith("https://")
      ) {
        if (key !== "url") {
          return true;
        }
        if (
          nested.includes("/storage/v1/object") ||
          nested.includes("token=")
        ) {
          return true;
        }
      }
    }
    if (studioMusicCatalogDtoContainsForbiddenFields(nested)) {
      return true;
    }
  }
  return false;
}

function findEntitlement(
  entitlements: StudioMusicCatalogEntitlement[],
  practiceId: string,
): StudioMusicCatalogEntitlement | null {
  return (
    entitlements.find(
      (row) =>
        row.practice_id === practiceId && hasStudioMusicEntitlement(row),
    ) ?? null
  );
}

export async function handleStudioMusicCatalog(input: {
  filter: string | null;
  cursor: string | null;
  limit: string | null;
  userId: string | null;
  visitorId?: string | null;
  store: StudioMusicCatalogStore;
}): Promise<StudioMusicCatalogHandlerResult> {
  const filter = parseStudioMusicCatalogFilter(input.filter ?? "all");
  if (!filter) {
    return { status: 400, body: { error: "invalid_filter" } };
  }

  if (filter === "mine" && !input.userId) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  const limit = parseStudioMusicCatalogLimit(input.limit);
  const cursor = decodeStudioMusicCatalogCursor(input.cursor);
  const authenticated = Boolean(input.userId);

  let practices: StudioMusicCatalogPublication[] = [];
  let entitlements: StudioMusicCatalogEntitlement[] = [];
  let authorMemberAuthorIds: string[] = [];

  if (filter === "mine" && input.userId) {
    const mine = await input.store.listMine(input.userId);
    entitlements = mine.entitlements;
    authorMemberAuthorIds = mine.authorMemberAuthorIds;
    practices = mine.practices.filter((practice) =>
      isMineStudioMusicPublication({
        practice,
        entitlement: findEntitlement(entitlements, String(practice.id ?? "")),
        isAuthorMember: Boolean(
          practice.author_id &&
            authorMemberAuthorIds.includes(practice.author_id),
        ),
      }),
    );
  } else {
    const inventory = await input.store.listPublicInventory(
      filter === "free" ? "free" : "all",
    );
    practices = inventory.filter((practice) =>
      filter === "free"
        ? isFreePublicStudioMusicInventory(practice)
        : isPublicStudioMusicInventory(practice),
    );
  }

  const ranked = practices
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

  const afterCursor = applyStudioMusicCatalogCursor(ranked, cursor);
  const { page, nextCursor } = paginateStudioMusicCatalogItems(
    afterCursor,
    limit,
  );
  const pagePractices = page.map((entry) => entry.practice);
  const pageIds = pagePractices.map((practice) => String(practice.id));

  const [tracks, prices] = await Promise.all([
    filter === "mine"
      ? input.store.loadTracksForMine(pageIds)
      : input.store.loadPublishedTracks(pageIds),
    input.store.resolveCheckoutPrices(
      pageIds,
      input.userId,
      input.visitorId ?? null,
    ),
  ]);
  const tracksByPractice = groupPublishedAudioItemsByPractice(tracks);

  const items = pagePractices.map((practice) => {
    const practiceId = String(practice.id);
    const entitlement = findEntitlement(entitlements, practiceId);
    const isAuthorMember = Boolean(
      practice.author_id && authorMemberAuthorIds.includes(practice.author_id),
    );
    const commerciallyAccessible = isCommerciallyAccessibleStudioPublication(
      practice,
    );
    const ownership = resolveStudioMusicOwnership({
      practice,
      entitlement,
      isAuthorMember,
      commerciallyAccessible,
    });
    const listenerEffectiveMinor =
      prices.get(practiceId)?.listenerEffectiveMinor ?? null;

    return mapStudioMusicCatalogItem({
      practice,
      tracks: tracksByPractice.get(practiceId) ?? [],
      ownership,
      listenerEffectiveMinor,
    });
  });

  const body: StudioMusicCatalogResult = {
    items,
    nextCursor,
    viewer: {
      authenticated,
      filter,
    },
  };

  if (studioMusicCatalogDtoContainsForbiddenFields(body)) {
    return { status: 500, body: { error: "internal_error" } };
  }

  return { status: 200, body };
}

const PRACTICE_SELECT = `
  id,
  author_id,
  title,
  slug,
  product_kind,
  publication_class,
  music_usage_permission,
  status,
  deleted_at,
  is_free,
  price,
  catalog_visibility,
  is_catalog_listed,
  cover_url,
  cover_image,
  updated_at,
  published_at,
  created_at,
  authors!practices_author_id_fkey (
    name,
    slug
  )
`;

async function loadStudioMusicAudioItems(
  supabase: SupabaseClient,
  practiceIds: string[],
  publishedOnly: boolean,
): Promise<PublishedAudioItemDetail[]> {
  if (practiceIds.length === 0) {
    return [];
  }

  let query = supabase
    .from("audio_items")
    .select("id, practice_id, title, position, duration_seconds")
    .in("practice_id", practiceIds)
    .order("position", { ascending: true });

  if (publishedOnly) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query;
  if (error) {
    throw new Error("studio_music_audio_items_lookup_failed");
  }

  return ((data ?? []) as Array<{
    id: string;
    practice_id: string;
    title: string;
    position: number;
    duration_seconds: number | null;
  }>).map((row) => ({
    id: row.id,
    practiceId: row.practice_id,
    title: row.title,
    position: row.position,
    durationSeconds: row.duration_seconds,
    coverUrl: null,
    coverImage: null,
    updatedAt: null,
  }));
}

export function createSupabaseStudioMusicCatalogStore(
  supabase: SupabaseClient,
): StudioMusicCatalogStore {
  return {
    async listPublicInventory(filter) {
      let query = supabase
        .from("practices")
        .select(PRACTICE_SELECT)
        .eq("status", "published")
        .is("deleted_at", null)
        .eq("catalog_visibility", "listed")
        .eq(
          "music_usage_permission",
          MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED,
        )
        .or("product_kind.eq.music,publication_class.eq.release");

      if (filter === "free") {
        query = query.eq("is_free", true);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error("studio_music_catalog_lookup_failed");
      }

      return filterPublicPracticeRows(
        (data ?? []) as StudioMusicCatalogPublication[],
      );
    },

    async listMine(userId) {
      const [entitlementResult, memberResult] = await Promise.all([
        supabase
          .from("studio_music_entitlements")
          .select("practice_id, grant_source, revoked_at")
          .eq("user_id", userId)
          .is("revoked_at", null),
        supabase
          .from("author_members")
          .select("author_id")
          .eq("user_id", userId),
      ]);

      if (entitlementResult.error || memberResult.error) {
        throw new Error("studio_music_mine_lookup_failed");
      }

      const entitlements = (entitlementResult.data ??
        []) as StudioMusicCatalogEntitlement[];
      const authorMemberAuthorIds = [
        ...new Set(
          (memberResult.data ?? [])
            .map((row) => String(row.author_id ?? ""))
            .filter(Boolean),
        ),
      ];
      const entitledIds = [
        ...new Set(
          entitlements
            .map((row) => String(row.practice_id ?? ""))
            .filter((id) => isStudioMusicCatalogUuid(id)),
        ),
      ];

      if (entitledIds.length === 0 && authorMemberAuthorIds.length === 0) {
        return { practices: [], entitlements, authorMemberAuthorIds };
      }

      let query = supabase
        .from("practices")
        .select(PRACTICE_SELECT)
        .is("deleted_at", null);

      if (entitledIds.length > 0 && authorMemberAuthorIds.length > 0) {
        query = query.or(
          `id.in.(${entitledIds.join(",")}),author_id.in.(${authorMemberAuthorIds.join(",")})`,
        );
      } else if (entitledIds.length > 0) {
        query = query.in("id", entitledIds);
      } else {
        query = query.in("author_id", authorMemberAuthorIds);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error("studio_music_mine_practices_lookup_failed");
      }

      return {
        practices: (data ?? []) as StudioMusicCatalogPublication[],
        entitlements,
        authorMemberAuthorIds,
      };
    },

    loadPublishedTracks(practiceIds) {
      return loadPublishedAudioItemsByPracticeIds(supabase, practiceIds);
    },

    loadTracksForMine(practiceIds) {
      return loadStudioMusicAudioItems(supabase, practiceIds, false);
    },

    async resolveCheckoutPrices(practiceIds, userId, visitorId) {
      const prices = new Map<
        string,
        { listenerEffectiveMinor: number | null }
      >();
      await Promise.all(
        practiceIds.map(async (practiceId) => {
          const resolved = await resolvePracticePriceRpc({
            supabase,
            practiceId,
            surface: PRICE_SURFACES.CHECKOUT,
            visitorId,
            userId,
          });
          prices.set(practiceId, {
            listenerEffectiveMinor: resolved?.finalPriceMinor ?? null,
          });
        }),
      );
      return prices;
    },
  };
}
