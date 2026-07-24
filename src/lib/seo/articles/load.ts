import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveProductAccess } from "@/lib/products/access";
import {
  getPublishedCatalogProducts,
  type CatalogProduct,
} from "@/lib/products/catalog";
import { resolveLibraryAction } from "@/lib/products/practice-access-ui";
import { buildSiteCanonicalUrl } from "@/lib/seo/public-page-metadata";

import { buildArticlePath } from "./paths";
import { estimateArticleReadingTimeMinutes } from "./reading-time";
import { getArticleBySlug } from "./registry";
import type { ArticlePageData } from "./types";

async function resolvePrimaryLibraryAction(
  supabase: SupabaseClient,
  product: CatalogProduct,
): Promise<ArticlePageData["libraryAction"]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: practiceRow, error } = await supabase
    .from("practices")
    .select(
      "id, author_id, is_free, status, is_catalog_listed, guest_access_enabled",
    )
    .eq("id", product.id)
    .maybeSingle();

  if (error || !practiceRow?.id || !practiceRow.author_id) {
    return user ? "add" : "sign_in";
  }

  const access = await resolveProductAccess(
    supabase,
    {
      id: practiceRow.id,
      author_id: practiceRow.author_id,
      is_free: practiceRow.is_free,
      status: practiceRow.status,
      is_catalog_listed: practiceRow.is_catalog_listed,
      guest_access_enabled: practiceRow.guest_access_enabled,
    },
    user?.id ?? null,
  );

  return resolveLibraryAction({
    access,
    practice: {
      is_free: practiceRow.is_free,
      status: practiceRow.status,
      is_catalog_listed: practiceRow.is_catalog_listed,
      guest_access_enabled: practiceRow.guest_access_enabled,
      price: product.price,
      format: product.format,
    },
    isAuthenticated: Boolean(user),
    buyerPreviewMode: false,
  });
}

export async function loadArticlePageData(
  supabase: SupabaseClient,
  slug: string,
): Promise<ArticlePageData | null> {
  const article = getArticleBySlug(slug);

  if (!article) {
    return null;
  }

  const catalog = await getPublishedCatalogProducts(supabase);
  const bySlug = new Map(catalog.map((product) => [product.slug, product]));
  const primaryPractice = bySlug.get(article.primaryPracticeSlug);

  if (!primaryPractice || !primaryPractice.authorSlug) {
    return null;
  }

  const relatedPractices = article.relatedPractices
    .map((ref) => {
      const product = bySlug.get(ref.slug);

      if (!product || product.slug === primaryPractice.slug) {
        return null;
      }

      return { product, blurb: ref.blurb };
    })
    .filter((item): item is { product: CatalogProduct; blurb: string } =>
      Boolean(item),
    )
    .slice(0, 3);

  const path = buildArticlePath(article.slug);
  const libraryAction = await resolvePrimaryLibraryAction(
    supabase,
    primaryPractice,
  );

  return {
    article,
    path,
    canonicalUrl: buildSiteCanonicalUrl(path),
    readingTimeMinutes: estimateArticleReadingTimeMinutes(article),
    primaryPractice,
    relatedPractices,
    libraryAction,
  };
}
