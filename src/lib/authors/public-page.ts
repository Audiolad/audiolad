import type { SupabaseClient } from "@supabase/supabase-js";

import { getDisplayFormat } from "@/lib/author-products/format";
import {
  getProductKindLabel,
  isAudioPostProductKind,
  isMusicProductKind,
  normalizeProductKind,
  type ProductKind,
} from "@/lib/author-products/product-kind";
import { mapProductCoverFields, type ProductCoverFields } from "@/lib/products/cover-display";
import { sanitizePublicImageManifest } from "@/lib/images/image-manifest";
import {
  resolveAuthorAvatarUrl,
  resolveAuthorBannerUrl,
} from "@/lib/images/resolve-display";
import { formatRubles, getProductPriceLabel } from "@/lib/products/price-format";
import { buildPracticePublicPath } from "@/lib/products/paths";
import { isProgramFormat } from "@/lib/products/practice-access-ui";
import { loadPricePromotionsForPractices } from "@/lib/pricing/queries";
import { resolvePracticePrice } from "@/lib/pricing/resolve";
import {
  PRICE_SURFACES,
  type PricePromotionRecord,
} from "@/lib/pricing/types";

import {
  getAuthorBySlug,
  type AuthorPublishedPractice,
} from "./lookup";
import { normalizeStoredBannerPosition } from "@/lib/authors/banner-position";

import {
  selectVisibleAuthorContacts,
  type AuthorPublicContact,
} from "./contacts";
import {
  getAuthorProfileDetail,
  type AuthorProfileTopic,
} from "./profile";
import { resolveAuthorPositioningText } from "./brand-assets";
import { findSimilarAuthors } from "./similar-authors";
import {
  resolveAuthorAppreciationSettings,
  type AuthorAppreciationSettings,
} from "@/lib/author-appreciation/effective-visibility";

export type AuthorPublicProduct = AuthorPublishedPractice &
  ProductCoverFields & {
  description: string | null;
  productKind: ProductKind;
  audioCount: number;
  isProgram: boolean;
  isFreeLabel: boolean;
};

export type AuthorPublicPageData = {
  id: string;
  name: string;
  slug: string;
  authorType: string;
  shortPositioning: string;
  fullBio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  avatarImage?: unknown;
  bannerImage?: unknown;
  bannerPositionX: number;
  bannerPositionY: number;
  publishedCount: number;
  topics: AuthorProfileTopic[];
  featuredProducts: AuthorPublicProduct[];
  allProducts: AuthorPublicProduct[];
  contacts: AuthorPublicContact[];
  similarAuthors: Awaited<ReturnType<typeof findSimilarAuthors>>;
  accessStatus: string | null;
  appreciationSettings: AuthorAppreciationSettings;
};

function mapPracticeRow(
  row: {
    id: string;
    title: string;
    slug: string;
    subtitle: string | null;
    description?: string | null;
    format: string | null;
    product_kind?: string | null;
    duration_minutes: number | null;
    price: number | null;
    is_free: boolean | null;
    cover_url?: string | null;
    cover_image?: unknown;
    updated_at?: string | null;
  },
  authorSlug: string,
  audioCount = 1,
  promotions: PricePromotionRecord[] = [],
): AuthorPublicProduct {
  const productKind = normalizeProductKind(row.product_kind);
  const resolved = resolvePracticePrice({
    isFree: row.is_free,
    basePrice: row.price,
    promotions,
    starts: [],
    surface: PRICE_SURFACES.CATALOG,
  });

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    subtitle: row.subtitle,
    description: row.description?.trim() || null,
    format: row.format,
    duration_minutes: row.duration_minutes,
    price: resolved.isFree ? row.price : resolved.finalPrice,
    is_free: resolved.isFree,
    href: buildPracticePublicPath(authorSlug, row.slug),
    priceLabel: resolved.isFree
      ? getProductPriceLabel(row.price, row.is_free)
      : formatRubles(resolved.finalPrice),
    compareAtPriceLabel:
      !resolved.isFree && resolved.promotion
        ? formatRubles(resolved.basePrice)
        : null,
    ...mapProductCoverFields(row),
    productKind,
    audioCount,
    isProgram:
      !isMusicProductKind(productKind) && isProgramFormat(row.format),
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
      "id, title, slug, subtitle, description, format, product_kind, duration_minutes, price, is_free, cover_url, cover_image, updated_at, created_at, published_at",
    )
    .eq("author_id", author.id)
    .eq("status", "published")
    .eq("is_catalog_listed", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (practicesError) {
    return { data: null, error: true };
  }

  const practiceIds = (practiceRows ?? []).map((row) => row.id as string);
  const promotionsByPractice = await loadPricePromotionsForPractices(
    supabase,
    practiceIds,
  );
  const audioCountMap = new Map<string, number>();

  if (practiceIds.length > 0) {
    const { data: audioRows } = await supabase
      .from("audio_items")
      .select("practice_id")
      .in("practice_id", practiceIds)
      .eq("status", "published");

    for (const row of audioRows ?? []) {
      const practiceId = row.practice_id as string;
      audioCountMap.set(practiceId, (audioCountMap.get(practiceId) ?? 0) + 1);
    }
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
        product_kind?: string | null;
        duration_minutes: number | null;
        price: number | null;
        is_free: boolean | null;
        cover_url: string | null;
        cover_image?: unknown;
        updated_at?: string | null;
      },
      author.slug,
      audioCountMap.get(row.id as string) ?? 1,
      promotionsByPractice.get(row.id as string) ?? [],
    ),
  );

  // Featured picks may include unlisted drafts in the author cabinet; the
  // public author page only surfaces catalog-listed published products.
  const listedProductIds = new Set(allProducts.map((product) => product.id));
  const featuredListed = (profile?.featuredProducts ?? []).filter((product) =>
    listedProductIds.has(product.id),
  );
  const featuredIds = new Set(featuredListed.map((product) => product.id));

  const featuredProducts = featuredListed.map((product) =>
    mapPracticeRow(
      {
        ...product,
        duration_minutes: null,
      },
      author.slug,
      1,
      promotionsByPractice.get(product.id) ?? [],
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
      shortPositioning: resolveAuthorPositioningText(
        profile?.short_positioning ?? null,
      ),
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
      ...(() => {
        const bannerPosition = normalizeStoredBannerPosition({
          banner_position_x: profile?.banner_position_x,
          banner_position_y: profile?.banner_position_y,
        });
        return {
          bannerPositionX: bannerPosition.x,
          bannerPositionY: bannerPosition.y,
        };
      })(),
      publishedCount: allProducts.length,
      topics: profile?.topics ?? [],
      featuredProducts,
      allProducts: sortedProducts,
      contacts: selectVisibleAuthorContacts(profile?.contacts ?? []),
      similarAuthors,
      accessStatus: author.access_status ?? null,
      appreciationSettings: resolveAuthorAppreciationSettings(
        author.author_appreciation_settings?.[0]
          ? {
              enabled:
                author.author_appreciation_settings[0]
                  .listener_appreciation_enabled,
              profileEnabled:
                author.author_appreciation_settings[0]
                  .listener_appreciation_profile_enabled,
              freeProductsDefault:
                author.author_appreciation_settings[0]
                  .listener_appreciation_free_products_default,
            }
          : null,
      ),
    },
    error: false,
  };
}

export function getAuthorProductTypeLabel(
  format: string | null,
  productKind?: string | null,
  audioCount = 1,
): string {
  if (isAudioPostProductKind(productKind)) {
    return getProductKindLabel(productKind);
  }

  if (isMusicProductKind(productKind)) {
    return getProductKindLabel(productKind);
  }

  return getDisplayFormat(format) ?? "Аудиопрактика";
}
