import type { MetadataRoute } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isFixtureMarkedAuthor,
  isPublicCatalogPracticeRow,
} from "@/lib/fixtures/test-fixture-marker";
import { isPracticePromoPageEligible } from "@/lib/promo-pages/validation";
import { buildPromoPagePath } from "@/lib/promo-pages/paths";
import { isValidPlaylistPublicSlug } from "@/lib/playlists/public-slug";
import { buildPublicPlaylistPath } from "@/lib/playlists/public-url";
import { buildAuthorPublicPath, buildPracticePublicPath } from "@/lib/products/paths";
import { PRODUCTION_APP_ORIGIN, getAppOrigin } from "@/lib/seo/app-origin";
import { isValidPublicEntitySlug } from "@/lib/seo/public-slug";
import {
  buildTopicHubPath,
  listTopicHubDefinitions,
} from "@/lib/seo/topic-hubs";
import {
  getPublishedCatalogProducts,
  getPublishedPracticeIdsForTopicKey,
} from "@/lib/products/catalog";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type SitemapEntry = MetadataRoute.Sitemap[number];

export const STATIC_SITEMAP_PAGES: Array<{
  path: string;
  changeFrequency: SitemapEntry["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/catalog", changeFrequency: "daily", priority: 0.9 },
  { path: "/authors", changeFrequency: "weekly", priority: 0.8 },
  { path: "/become-author", changeFrequency: "monthly", priority: 0.5 },
  { path: "/first-audio-course", changeFrequency: "monthly", priority: 0.6 },
  { path: "/offer", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/consent", changeFrequency: "yearly", priority: 0.3 },
  { path: "/payment-and-refund", changeFrequency: "yearly", priority: 0.3 },
  { path: "/requisites", changeFrequency: "yearly", priority: 0.3 },
];

export function toAbsoluteSitemapUrl(
  path: string,
  origin: string = getAppOrigin(),
): string {
  const normalizedPath = path.split(/[?#]/)[0] || path;
  return `${origin.replace(/\/$/, "")}${normalizedPath}`;
}

export function toLastModified(
  value: string | null | undefined,
): Date | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

export function resolveContentLastModified(
  ...values: Array<string | null | undefined>
): Date | undefined {
  for (const value of values) {
    const parsed = toLastModified(value);

    if (parsed) {
      return parsed;
    }
  }

  return undefined;
}

export function buildStaticSitemapEntries(
  origin: string = getAppOrigin(),
): SitemapEntry[] {
  return STATIC_SITEMAP_PAGES.map((page) => ({
    url: toAbsoluteSitemapUrl(page.path, origin),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}

type PracticeSitemapRow = {
  slug: string;
  status: string | null;
  is_catalog_listed: boolean | null;
  author_id: string | null;
  updated_at: string | null;
  published_at: string | null;
  created_at: string | null;
  cover_image?: unknown;
  authors:
    | { slug: string; avatar_image?: unknown }
    | { slug: string; avatar_image?: unknown }[]
    | null;
};

function normalizeAuthorFromPracticeRow(
  authors: PracticeSitemapRow["authors"],
): { slug: string; avatar_image?: unknown } | null {
  const author = Array.isArray(authors) ? authors[0] : authors;
  const slug = author?.slug?.trim();

  if (!slug || !isValidPublicEntitySlug(slug)) {
    return null;
  }

  if (author?.avatar_image != null && isFixtureMarkedAuthor(author)) {
    return null;
  }

  return author ?? null;
}

export function mapPracticeRowsToSitemapEntries(
  rows: PracticeSitemapRow[],
  origin: string = getAppOrigin(),
): SitemapEntry[] {
  const seen = new Set<string>();

  return rows.flatMap((row) => {
    if (!isPublicCatalogPracticeRow(row)) {
      return [];
    }

    const productSlug = row.slug?.trim();

    if (!productSlug || !isValidPublicEntitySlug(productSlug)) {
      return [];
    }

    const author = normalizeAuthorFromPracticeRow(row.authors);

    if (!author) {
      return [];
    }

    const path = buildPracticePublicPath(author.slug, productSlug);

    if (seen.has(path)) {
      return [];
    }

    seen.add(path);

    const lastModified = resolveContentLastModified(
      row.updated_at,
      row.published_at,
      row.created_at,
    );

    return [
      {
        url: toAbsoluteSitemapUrl(path, origin),
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      },
    ];
  });
}

type AuthorPracticeSitemapRow = {
  status: string | null;
  is_catalog_listed: boolean | null;
  slug: string | null;
  author_id: string | null;
  updated_at: string | null;
  published_at: string | null;
  created_at: string | null;
  cover_image?: unknown;
  authors:
    | { slug: string; avatar_image?: unknown }
    | { slug: string; avatar_image?: unknown }[]
    | null;
};

export function mapAuthorPracticeRowsToSitemapEntries(
  rows: AuthorPracticeSitemapRow[],
  origin: string = getAppOrigin(),
): SitemapEntry[] {
  const authorTimestamps = new Map<string, Date>();

  for (const row of rows) {
    if (!isPublicCatalogPracticeRow(row)) {
      continue;
    }

    const author = normalizeAuthorFromPracticeRow(row.authors);

    if (!author) {
      continue;
    }

    const lastModified = resolveContentLastModified(
      row.updated_at,
      row.published_at,
      row.created_at,
    );

    if (!lastModified) {
      continue;
    }

    const current = authorTimestamps.get(author.slug);

    if (!current || lastModified > current) {
      authorTimestamps.set(author.slug, lastModified);
    }
  }

  return [...authorTimestamps.entries()].map(([slug, lastModified]) => ({
    url: toAbsoluteSitemapUrl(buildAuthorPublicPath(slug), origin),
    lastModified,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));
}

type PlaylistSitemapRow = {
  slug: string | null;
  updated_at: string | null;
  published_at: string | null;
};

export function mapPlaylistRowsToSitemapEntries(
  rows: PlaylistSitemapRow[],
  origin: string = getAppOrigin(),
): SitemapEntry[] {
  const seen = new Set<string>();

  return rows.flatMap((row) => {
    const slug = row.slug?.trim();

    if (!slug || !isValidPlaylistPublicSlug(slug) || !row.published_at?.trim()) {
      return [];
    }

    const path = buildPublicPlaylistPath(slug);

    if (seen.has(path)) {
      return [];
    }

    seen.add(path);

    const lastModified = resolveContentLastModified(
      row.updated_at,
      row.published_at,
    );

    return [
      {
        url: toAbsoluteSitemapUrl(path, origin),
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: "weekly" as const,
        priority: 0.5,
      },
    ];
  });
}

type PromoProductEmbed = {
  status: string | null;
  is_free: boolean | null;
  is_catalog_listed: boolean | null;
  guest_access_enabled: boolean | null;
};

type PromoPageSitemapRow = {
  slug: string;
  updated_at: string | null;
  published_at: string | null;
  created_at: string | null;
  authors:
    | { slug: string; avatar_image?: unknown }
    | { slug: string; avatar_image?: unknown }[]
    | null;
  promo_page_products?:
    | Array<{
        practices: PromoProductEmbed | PromoProductEmbed[] | null;
      }>
    | null;
};

function promoPageHasEligibleProduct(row: PromoPageSitemapRow): boolean {
  const products = row.promo_page_products ?? [];

  let eligibleCount = 0;

  for (const link of products) {
    const practice = Array.isArray(link.practices)
      ? link.practices[0]
      : link.practices;

    if (!practice) {
      continue;
    }

    if (isPracticePromoPageEligible(practice)) {
      eligibleCount += 1;
    }
  }

  return eligibleCount >= 1;
}

export function mapPromoPageRowsToSitemapEntries(
  rows: PromoPageSitemapRow[],
  origin: string = getAppOrigin(),
): SitemapEntry[] {
  const seen = new Set<string>();

  return rows.flatMap((row) => {
    const promoSlug = row.slug?.trim();
    const author = normalizeAuthorFromPracticeRow(row.authors);

    if (!promoSlug || !author || !isValidPublicEntitySlug(promoSlug)) {
      return [];
    }

    if (!promoPageHasEligibleProduct(row)) {
      return [];
    }

    const path = buildPromoPagePath(author.slug, promoSlug);

    if (seen.has(path)) {
      return [];
    }

    seen.add(path);

    const lastModified = resolveContentLastModified(
      row.updated_at,
      row.published_at,
      row.created_at,
    );

    return [
      {
        url: toAbsoluteSitemapUrl(path, origin),
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: "weekly" as const,
        priority: 0.65,
      },
    ];
  });
}

export function deduplicateSitemapEntries(
  entries: SitemapEntry[],
): SitemapEntry[] {
  const seen = new Set<string>();
  const result: SitemapEntry[] = [];

  for (const entry of entries) {
    const normalized = entry.url.trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(entry);
  }

  return result;
}

export function mergeSitemapEntryGroups(
  ...groups: SitemapEntry[][]
): SitemapEntry[] {
  return deduplicateSitemapEntries(groups.flat());
}

async function fetchProductSitemapEntries(
  supabase: SupabaseClient,
): Promise<SitemapEntry[]> {
  try {
    const { data, error } = await supabase
      .from("practices")
      .select(
        `
        slug,
        status,
        is_catalog_listed,
        author_id,
        updated_at,
        published_at,
        created_at,
        cover_image,
        authors!practices_author_id_fkey (
          slug,
          avatar_image
        )
      `,
      )
      .eq("status", "published")
      .eq("is_catalog_listed", true)
      .not("slug", "is", null)
      .not("author_id", "is", null);

    if (error) {
      console.error("[sitemap] practices query failed:", error.message);
      return [];
    }

    return mapPracticeRowsToSitemapEntries((data ?? []) as PracticeSitemapRow[]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sitemap] practices query unexpected error:", message);
    return [];
  }
}

async function fetchAuthorSitemapEntries(
  supabase: SupabaseClient,
): Promise<SitemapEntry[]> {
  try {
    const { data, error } = await supabase
      .from("practices")
      .select(
        `
        status,
        is_catalog_listed,
        slug,
        author_id,
        cover_image,
        updated_at,
        published_at,
        created_at,
        authors!practices_author_id_fkey (
          slug,
          avatar_image
        )
      `,
      )
      .eq("status", "published")
      .eq("is_catalog_listed", true)
      .not("author_id", "is", null);

    if (error) {
      console.error("[sitemap] authors query failed:", error.message);
      return [];
    }

    return mapAuthorPracticeRowsToSitemapEntries(
      (data ?? []) as AuthorPracticeSitemapRow[],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sitemap] authors query unexpected error:", message);
    return [];
  }
}

async function fetchPublicPlaylistSitemapEntries(
  supabase: SupabaseClient,
): Promise<SitemapEntry[]> {
  try {
    const { data, error } = await supabase
      .from("playlists")
      .select("slug, updated_at, published_at")
      .eq("visibility", "public")
      .not("published_at", "is", null)
      .not("slug", "is", null);

    if (error) {
      console.error("[sitemap] playlists query failed:", error.message);
      return [];
    }

    return mapPlaylistRowsToSitemapEntries((data ?? []) as PlaylistSitemapRow[]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sitemap] playlists query unexpected error:", message);
    return [];
  }
}

async function fetchPromoPageSitemapEntries(): Promise<SitemapEntry[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("promo_pages")
      .select(
        `
        slug,
        updated_at,
        published_at,
        created_at,
        authors!inner (
          slug,
          avatar_image
        ),
        promo_page_products (
          practices (
            status,
            is_free,
            is_catalog_listed,
            guest_access_enabled
          )
        )
      `,
      )
      .eq("status", "published")
      .not("slug", "is", null);

    if (error) {
      console.error("[sitemap] promo_pages query failed:", error.message);
      return [];
    }

    return mapPromoPageRowsToSitemapEntries(
      (data ?? []) as PromoPageSitemapRow[],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sitemap] promo_pages query unavailable:", message);
    return [];
  }
}

export function mapTopicHubDefinitionsToSitemapEntries(
  hubs: ReadonlyArray<{ slug: string }> = listTopicHubDefinitions(),
  origin: string = getAppOrigin(),
): SitemapEntry[] {
  return hubs.map((hub) => ({
    url: toAbsoluteSitemapUrl(buildTopicHubPath(hub.slug), origin),
    changeFrequency: "weekly" as const,
    priority: 0.75,
  }));
}

async function fetchTopicHubSitemapEntries(
  supabase: SupabaseClient,
): Promise<SitemapEntry[]> {
  try {
    const hubs = listTopicHubDefinitions();
    const eligible: Array<{ slug: string }> = [];

    for (const hub of hubs) {
      let hasProducts = false;

      if (hub.topicKey) {
        const practiceIds = await getPublishedPracticeIdsForTopicKey(
          supabase,
          hub.topicKey,
        );
        hasProducts = practiceIds.length > 0;
      } else {
        const products = await getPublishedCatalogProducts(
          supabase,
          undefined,
        );
        const filtered = hub.freeOnly
          ? products.filter((product) => product.isFree)
          : products;
        const allowlist = hub.practiceSlugAllowlist;

        if (allowlist && allowlist.length > 0) {
          const allowed = new Set(allowlist);
          hasProducts = filtered.some((product) => allowed.has(product.slug));
        } else {
          hasProducts = filtered.length > 0;
        }
      }

      if (hasProducts) {
        eligible.push({ slug: hub.slug });
      }
    }

    return mapTopicHubDefinitionsToSitemapEntries(eligible);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sitemap] topic hubs query unexpected error:", message);
    return [];
  }
}

export type SitemapBuildStats = {
  static: number;
  products: number;
  authors: number;
  playlists: number;
  promos: number;
  topicHubs: number;
  total: number;
};

export async function buildSitemapEntries(): Promise<{
  entries: SitemapEntry[];
  stats: SitemapBuildStats;
}> {
  const staticEntries = buildStaticSitemapEntries();

  let productEntries: SitemapEntry[] = [];
  let authorEntries: SitemapEntry[] = [];
  let playlistEntries: SitemapEntry[] = [];
  let promoEntries: SitemapEntry[] = [];
  let topicHubEntries: SitemapEntry[] = [];

  try {
    const supabase = await createClient();
    [
      productEntries,
      authorEntries,
      playlistEntries,
      promoEntries,
      topicHubEntries,
    ] = await Promise.all([
      fetchProductSitemapEntries(supabase),
      fetchAuthorSitemapEntries(supabase),
      fetchPublicPlaylistSitemapEntries(supabase),
      fetchPromoPageSitemapEntries(),
      fetchTopicHubSitemapEntries(supabase),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sitemap] supabase client unavailable:", message);
  }

  const entries = mergeSitemapEntryGroups(
    staticEntries,
    productEntries,
    authorEntries,
    playlistEntries,
    promoEntries,
    topicHubEntries,
  );

  return {
    entries,
    stats: {
      static: staticEntries.length,
      products: productEntries.length,
      authors: authorEntries.length,
      playlists: playlistEntries.length,
      promos: promoEntries.length,
      topicHubs: topicHubEntries.length,
      total: entries.length,
    },
  };
}

/** Production origin used in sitemap URLs when env is unset (tests). */
export { PRODUCTION_APP_ORIGIN };
