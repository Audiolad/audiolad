import type { SupabaseClient } from "@supabase/supabase-js";

import { getDisplayFormat } from "@/lib/author-products/format";
import { mapProductCoverFields, type ProductCoverFields } from "@/lib/products/cover-display";
import { sanitizePublicImageManifest } from "@/lib/images/image-manifest";
import {
  resolveAuthorAvatarUrl,
  resolveAuthorBannerUrl,
} from "@/lib/images/resolve-display";
import { getProductPriceLabel } from "@/lib/products/price-format";
import { buildPracticePublicPath } from "@/lib/products/paths";
import { isProgramFormat } from "@/lib/products/practice-access-ui";

import {
  getAuthorBySlug,
  type AuthorPublishedPractice,
} from "./lookup";
import {
  getAuthorProfileDetail,
  resolveAuthorShortBio,
  type AuthorProfileTopic,
} from "./profile";
import { findSimilarAuthors } from "./similar-authors";

export type AuthorPublicProduct = AuthorPublishedPractice &
  ProductCoverFields & {
  description: string | null;
  isProgram: boolean;
  isFreeLabel: boolean;
};

export type AuthorPublicPageData = {
  id: string;
  name: string;
  slug: string;
  authorType: string;
  shortBio: string | null;
  fullBio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  avatarImage?: unknown;
  bannerImage?: unknown;
  publishedCount: number;
  topics: AuthorProfileTopic[];
  featuredProducts: AuthorPublicProduct[];
  allProducts: AuthorPublicProduct[];
  similarAuthors: Awaited<ReturnType<typeof findSimilarAuthors>>;
};

function mapPracticeRow(
  row: {
    id: string;
    title: string;
    slug: string;
    subtitle: string | null;
    description?: string | null;
    format: string | null;
    duration_minutes: number | null;
    price: number | null;
    is_free: boolean | null;
    cover_url?: string | null;
    cover_image?: unknown;
    updated_at?: string | null;
  },
  authorSlug: string,
): AuthorPublicProduct {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    subtitle: row.subtitle,
    description: row.description?.trim() || null,
    format: row.format,
    duration_minutes: row.duration_minutes,
    price: row.price,
    is_free: row.is_free,
    href: buildPracticePublicPath(authorSlug, row.slug),
    priceLabel: getProductPriceLabel(row.price, row.is_free),
    ...mapProductCoverFields(row),
    isProgram: isProgramFormat(row.format),
    isFreeLabel: row.is_free === true,
  };
}

export async function loadAuthorPublicPageData(
  supabase: SupabaseClient,
  authorSlug: string,
): Promise<{ data: AuthorPublicPageData | null; error: boolean }> {
  const { author, error } = await getAuthorBySlug(supabase, authorSlug);

  if (error) {
    return { data: null, error: true };
  }

  if (!author) {
    return { data: null, error: false };
  }

  const profile = await getAuthorProfileDetail(supabase, author.id);

  const { data: practiceRows, error: practicesError } = await supabase
    .from("practices")
    .select(
      "id, title, slug, subtitle, description, format, duration_minutes, price, is_free, cover_url, cover_image, updated_at, created_at, published_at",
    )
    .eq("author_id", author.id)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (practicesError) {
    return { data: null, error: true };
  }

  const allProducts = (practiceRows ?? []).map((row) =>
    mapPracticeRow(
      row as {
        id: string;
        title: string;
        slug: string;
        subtitle: string | null;
        description: string | null;
        format: string | null;
        duration_minutes: number | null;
        price: number | null;
        is_free: boolean | null;
        cover_url: string | null;
        cover_image?: unknown;
        updated_at?: string | null;
      },
      author.slug,
    ),
  );

  const featuredIds = new Set(
    (profile?.featuredProducts ?? []).map((product) => product.id),
  );

  const featuredProducts = (profile?.featuredProducts ?? []).map((product) =>
    mapPracticeRow(
      {
        ...product,
        duration_minutes: null,
      },
      author.slug,
    ),
  );

  const remainingProducts = allProducts.filter(
    (product) => !featuredIds.has(product.id),
  );

  const sortedProducts = [...featuredProducts, ...remainingProducts];

  const similarAuthors = await findSimilarAuthors(
    supabase,
    author.id,
    author.slug,
    profile?.topics.map((topic) => topic.key) ?? [],
  );

  return {
    data: {
      id: author.id,
      name: author.name,
      slug: author.slug,
      authorType: profile?.author_type ?? "person",
      shortBio: resolveAuthorShortBio({
        short_bio: profile?.short_bio ?? author.short_bio,
        description: profile?.description ?? author.description,
      }),
      fullBio: profile?.full_bio?.trim() || null,
      avatarUrl: resolveAuthorAvatarUrl(
        {
          avatar_url: profile?.avatar_url ?? author.avatar_url,
          avatar_image: profile?.avatar_image,
          updated_at: profile?.updated_at ?? null,
        },
        104,
        "md",
      ),
      bannerUrl: resolveAuthorBannerUrl(
        {
          banner_url: profile?.banner_url,
          banner_image: profile?.banner_image,
          updated_at: profile?.updated_at,
        },
        1280,
        "md",
      ),
      avatarImage: sanitizePublicImageManifest(profile?.avatar_image),
      bannerImage: sanitizePublicImageManifest(profile?.banner_image),
      publishedCount: allProducts.length,
      topics: profile?.topics ?? [],
      featuredProducts,
      allProducts: sortedProducts,
      similarAuthors,
    },
    error: false,
  };
}

export function getAuthorProductTypeLabel(format: string | null): string {
  return getDisplayFormat(format) ?? "Аудиопрактика";
}
