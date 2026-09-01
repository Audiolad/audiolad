import type { SupabaseClient } from "@supabase/supabase-js";

import { PRODUCT_KIND } from "@/lib/author-products/product-kind";
import { resolveProductAccess } from "@/lib/products/access";
import {
  getPracticeAuthorSlug,
  getPracticeByAuthorAndSlug,
} from "@/lib/products/lookup";
import { buildPracticePublicPath } from "@/lib/products/paths";
import {
  getPublishedCatalogProducts,
  type CatalogProduct,
} from "@/lib/products/catalog";
import { resolveLibraryAction } from "@/lib/products/practice-access-ui";
import { buildCatalogListingPriceView } from "@/lib/pricing/catalog-listing";
import {
  loadPersonalPromotionStarts,
  loadPricePromotionsForPractice,
} from "@/lib/pricing/queries";
import { readPriceVisitorId } from "@/lib/pricing/visitor";
import { buildSiteCanonicalUrl } from "@/lib/seo/public-page-metadata";

import { buildArticlePath } from "./paths";
import { estimateArticleReadingTimeMinutes } from "./reading-time";
import { getArticleBySlug } from "./registry";
import {
  buildCatalogPracticeKeyIndex,
  resolveArticlePrimaryPractice,
  resolveArticleRelatedPractices,
} from "./resolve-practices";
import {
  isCreatorArticleDefinition,
  isPracticeArticleDefinition,
  type ArticlePageData,
  type CreatorArticlePageData,
  type PracticeArticlePageData,
} from "./types";

function assertNever(value: never): never {
  throw new Error(`Unsupported article continuation: ${JSON.stringify(value)}`);
}

function assertInvalidArticleDefinition(): never {
  throw new Error("Article continuation does not match its definition");
}

const MEDITATION_SOLUTIONS_AUTHOR_SLUG = "sergey-petrov";
const MEDITATION_SOLUTIONS_PRODUCT_SLUG =
  "25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditatsiy";

/**
 * Reuses the Catalog's existing personal-countdown entry calculation.
 *
 * Article pages are already force-dynamic and this function reads the current
 * request's auth/cookie context; its returned `?promo=` URL is never cached or
 * shared between viewers.
 */
async function loadMeditationSolutionsPromoHref(
  supabase: SupabaseClient,
): Promise<string> {
  const fallbackHref = buildPracticePublicPath(
    MEDITATION_SOLUTIONS_AUTHOR_SLUG,
    MEDITATION_SOLUTIONS_PRODUCT_SLUG,
  );
  const [{ practice, error }, visitorId, authResult] = await Promise.all([
    getPracticeByAuthorAndSlug(
      supabase,
      MEDITATION_SOLUTIONS_AUTHOR_SLUG,
      MEDITATION_SOLUTIONS_PRODUCT_SLUG,
    ),
    readPriceVisitorId(),
    supabase.auth.getUser(),
  ]);

  if (error || !practice) {
    return fallbackHref;
  }

  const [promotions, starts] = await Promise.all([
    loadPricePromotionsForPractice(supabase, practice.id),
    loadPersonalPromotionStarts({
      supabase,
      practiceId: practice.id,
      visitorId,
      userId: authResult.data.user?.id ?? null,
    }),
  ]);
  const authorSlug = getPracticeAuthorSlug(practice);

  if (!authorSlug) {
    return fallbackHref;
  }

  return buildCatalogListingPriceView({
    isFree: practice.is_free,
    basePrice: practice.price,
    promotions,
    starts,
    authorSlug,
    productSlug: practice.slug,
    personalTeaser: true,
  }).href;
}

async function resolvePrimaryLibraryAction(
  supabase: SupabaseClient,
  product: CatalogProduct,
): Promise<PracticeArticlePageData["libraryAction"]> {
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

  const path = buildArticlePath(article.slug);

  switch (article.productContinuation.kind) {
    case "creator_paths": {
      if (!isCreatorArticleDefinition(article)) {
        return assertInvalidArticleDefinition();
      }

      return {
        article,
        path,
        canonicalUrl: buildSiteCanonicalUrl(path),
        readingTimeMinutes: estimateArticleReadingTimeMinutes(article),
        solutionsPromoHref: await loadMeditationSolutionsPromoHref(supabase),
      } satisfies CreatorArticlePageData;
    }

    case "practice": {
      if (!isPracticeArticleDefinition(article)) {
        return assertInvalidArticleDefinition();
      }

      const catalog = await getPublishedCatalogProducts(supabase, {
        productKind: PRODUCT_KIND.PRACTICE,
      });
      const catalogByKey = buildCatalogPracticeKeyIndex(catalog);
      const primaryPractice = resolveArticlePrimaryPractice(article, catalogByKey);

      if (!primaryPractice || !primaryPractice.authorSlug) {
        return null;
      }

      const relatedPractices = resolveArticleRelatedPractices(
        article,
        catalogByKey,
        primaryPractice.id,
      ).map(({ product, blurb }) => ({ product, blurb }));

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
      } satisfies PracticeArticlePageData;
    }

    default:
      return assertNever(article.productContinuation);
  }
}
