import type { MetadataRoute } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isValidPlaylistPublicSlug } from "@/lib/playlists/public-slug";
import { getAppOrigin } from "@/lib/seo/app-origin";
import { isValidPublicEntitySlug } from "@/lib/seo/public-slug";
import { buildAuthorPublicPath, buildPracticePublicPath } from "@/lib/products/paths";
import { buildPublicPlaylistPath } from "@/lib/playlists/public-url";
import { createClient } from "@/lib/supabase/server";

type SitemapEntry = MetadataRoute.Sitemap[number];

const STATIC_SITEMAP_PAGES: Array<{
  path: string;
  changeFrequency: SitemapEntry["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/catalog", changeFrequency: "daily", priority: 0.9 },
  { path: "/authors", changeFrequency: "weekly", priority: 0.8 },
  { path: "/first-audio-course", changeFrequency: "monthly", priority: 0.6 },
  { path: "/offer", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/consent", changeFrequency: "yearly", priority: 0.3 },
  { path: "/payment-and-refund", changeFrequency: "yearly", priority: 0.3 },
  { path: "/requisites", changeFrequency: "yearly", priority: 0.3 },
];

function toAbsoluteSitemapUrl(path: string): string {
  return `${getAppOrigin()}${path}`;
}

function toLastModified(value: string | null | undefined): Date | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

function buildStaticSitemapEntries(): SitemapEntry[] {
  return STATIC_SITEMAP_PAGES.map((page) => ({
    url: toAbsoluteSitemapUrl(page.path),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}

type PracticeSitemapRow = {
  slug: string;
  updated_at: string | null;
  created_at: string | null;
  authors:
    | { slug: string }
    | { slug: string }[]
    | null;
};

function normalizeAuthorSlug(
  authors: PracticeSitemapRow["authors"],
): string | null {
  const author = Array.isArray(authors) ? authors[0] : authors;
  const slug = author?.slug?.trim();

  return slug && isValidPublicEntitySlug(slug) ? slug : null;
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
        updated_at,
        created_at,
        authors!practices_author_id_fkey!inner (
          slug
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

    const seen = new Set<string>();

    return ((data ?? []) as PracticeSitemapRow[]).flatMap((row) => {
      const productSlug = row.slug?.trim();

      if (!productSlug || !isValidPublicEntitySlug(productSlug)) {
        return [];
      }

      const authorSlug = normalizeAuthorSlug(row.authors);

      if (!authorSlug) {
        return [];
      }

      const path = buildPracticePublicPath(authorSlug, productSlug);

      if (seen.has(path)) {
        return [];
      }

      seen.add(path);

      return [
        {
          url: toAbsoluteSitemapUrl(path),
          lastModified:
            toLastModified(row.updated_at) ??
            toLastModified(row.created_at),
          changeFrequency: "weekly" as const,
          priority: 0.7,
        },
      ];
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sitemap] practices query unexpected error:", message);
    return [];
  }
}

type AuthorSitemapRow = {
  slug: string;
  updated_at: string | null;
};

async function fetchAuthorSitemapEntries(
  supabase: SupabaseClient,
): Promise<SitemapEntry[]> {
  try {
    const { data, error } = await supabase
      .from("practices")
      .select(
        `
        updated_at,
        authors!practices_author_id_fkey!inner (
          slug
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

    const authorTimestamps = new Map<string, Date>();

    for (const row of (data ?? []) as Array<{
      updated_at: string | null;
      authors: AuthorSitemapRow | AuthorSitemapRow[] | null;
    }>) {
      const author = Array.isArray(row.authors) ? row.authors[0] : row.authors;
      const slug = author?.slug?.trim();

      if (!slug || !isValidPublicEntitySlug(slug)) {
        continue;
      }

      const lastModified = toLastModified(row.updated_at);

      if (!lastModified) {
        if (!authorTimestamps.has(slug)) {
          authorTimestamps.set(slug, new Date());
        }

        continue;
      }

      const current = authorTimestamps.get(slug);

      if (!current || lastModified > current) {
        authorTimestamps.set(slug, lastModified);
      }
    }

    return [...authorTimestamps.entries()].map(([slug, lastModified]) => ({
      url: toAbsoluteSitemapUrl(buildAuthorPublicPath(slug)),
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sitemap] authors query unexpected error:", message);
    return [];
  }
}

type PlaylistSitemapRow = {
  slug: string | null;
  updated_at: string | null;
  published_at: string | null;
};

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

    const seen = new Set<string>();

    return ((data ?? []) as PlaylistSitemapRow[]).flatMap((row) => {
      const slug = row.slug?.trim();

      if (!slug || !isValidPlaylistPublicSlug(slug)) {
        return [];
      }

      const path = buildPublicPlaylistPath(slug);

      if (seen.has(path)) {
        return [];
      }

      seen.add(path);

      return [
        {
          url: toAbsoluteSitemapUrl(path),
          lastModified:
            toLastModified(row.updated_at) ??
            toLastModified(row.published_at),
          changeFrequency: "weekly" as const,
          priority: 0.5,
        },
      ];
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sitemap] playlists query unexpected error:", message);
    return [];
  }
}

export type SitemapBuildStats = {
  static: number;
  products: number;
  authors: number;
  playlists: number;
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

  try {
    const supabase = await createClient();
    [productEntries, authorEntries, playlistEntries] = await Promise.all([
      fetchProductSitemapEntries(supabase),
      fetchAuthorSitemapEntries(supabase),
      fetchPublicPlaylistSitemapEntries(supabase),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sitemap] supabase client unavailable:", message);
  }

  const entries = [
    ...staticEntries,
    ...productEntries,
    ...authorEntries,
    ...playlistEntries,
  ];

  return {
    entries,
    stats: {
      static: staticEntries.length,
      products: productEntries.length,
      authors: authorEntries.length,
      playlists: playlistEntries.length,
      total: entries.length,
    },
  };
}
