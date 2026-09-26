import "server-only";

import { loadPublicPromoPage } from "@/lib/promo-pages/public-page";
import type { PublicPromoPageCtaBlock } from "@/lib/promo-pages/types";
import { mapPublicPromoPageCtaBlock } from "@/lib/promo-pages/public-page";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type MaxPromoProduct = {
  practiceId: string;
  slug: string;
  title: string;
  format: string | null;
  durationMinutes: number | null;
  coverUrl: string | null;
  authorName: string;
  authorSlug: string;
};

export type MaxPromoPage = {
  promoPageId: string;
  authorSlug: string;
  promoSlug: string;
  publicTitle: string;
  publicDescription: string | null;
  footerText: string | null;
  bannerUrl: string | null;
  authorName: string | null;
  cta: PublicPromoPageCtaBlock | null;
  products: MaxPromoProduct[];
};

export async function getMaxPromoPage(
  authorSlug: string,
  promoSlug: string,
): Promise<
  | { ok: true; page: MaxPromoPage }
  | { ok: false; reason: "not_found" | "storage_unavailable" }
> {
  const normalizedAuthor = authorSlug.trim();
  const normalizedPromo = promoSlug.trim();
  if (!normalizedAuthor || !normalizedPromo) {
    return { ok: false, reason: "not_found" };
  }

  try {
    const loaded = await loadPublicPromoPage(
      createServiceRoleClient(),
      normalizedAuthor,
      normalizedPromo,
    );
    if (!loaded.ok) {
      return {
        ok: false,
        reason: loaded.reason === "not_found" ? "not_found" : "storage_unavailable",
      };
    }

    const { page, bannerUrl } = loaded;
    const authorName = page.products[0]?.author_name?.trim() || null;

    return {
      ok: true,
      page: {
        promoPageId: page.promo_page_id,
        authorSlug: page.author_slug,
        promoSlug: page.slug,
        publicTitle: page.public_title,
        publicDescription: page.public_description,
        footerText: page.footer_text,
        bannerUrl,
        authorName,
        cta: mapPublicPromoPageCtaBlock(page),
        products: page.products.map((product) => ({
          practiceId: product.practice_id,
          slug: product.slug,
          title: product.title,
          format: product.format,
          durationMinutes: product.duration_minutes,
          coverUrl: product.cover_url,
          authorName: product.author_name,
          authorSlug: product.author_slug,
        })),
      },
    };
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
}
