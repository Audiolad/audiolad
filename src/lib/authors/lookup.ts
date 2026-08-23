import type { SupabaseClient } from "@supabase/supabase-js";

import {
  filterPublicPracticeRows,
  isFixtureMarkedAuthor,
} from "@/lib/fixtures/test-fixture-marker";

import { buildPracticePublicPath } from "@/lib/products/paths";
import { getProductPriceLabel, formatRubles } from "@/lib/products/price-format";
import { loadPricePromotionsForPractices } from "@/lib/pricing/queries";
import { resolvePracticePrice } from "@/lib/pricing/resolve";
import { PRICE_SURFACES } from "@/lib/pricing/types";

export type PublicAuthorRow = {
  id: string;
  name: string;
  slug: string;
  author_type?: string | null;
  description: string | null;
  short_bio?: string | null;
  full_bio?: string | null;
  avatar_url: string | null;
  banner_url?: string | null;
};

export type AuthorPublishedPractice = {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  format: string | null;
  duration_minutes: number | null;
  price: number | null;
  is_free: boolean | null;
  href: string;
  priceLabel: string;
  compareAtPriceLabel?: string | null;
};

export async function getAuthorBySlug(
  supabase: SupabaseClient,
  authorSlug: string,
): Promise<{ author: PublicAuthorRow | null; error: boolean }> {
  const { data, error } = await supabase
    .from("authors")
    .select(
      "id, name, slug, author_type, description, short_bio, full_bio, avatar_url, banner_url, avatar_image",
    )
    .eq("slug", authorSlug)
    .maybeSingle();

  if (error) {
    return { author: null, error: true };
  }

  const author = (data as (PublicAuthorRow & { avatar_image?: unknown }) | null) ?? null;
  if (author && isFixtureMarkedAuthor(author)) {
    return { author: null, error: false };
  }

  return { author, error: false };
}

function formatPracticePriceLabel(
  price: number | null,
  isFree: boolean | null,
): string {
  return getProductPriceLabel(price, isFree);
}

export async function getAuthorPublishedPractices(
  supabase: SupabaseClient,
  authorId: string,
  authorSlug: string,
): Promise<{ practices: AuthorPublishedPractice[]; error: boolean }> {
  const { data, error } = await supabase
    .from("practices")
    .select(
      "id, title, slug, subtitle, format, duration_minutes, price, is_free, cover_image",
    )
    .eq("author_id", authorId)
    .eq("status", "published")
    .eq("is_catalog_listed", true)
    .order("created_at", { ascending: false });

  if (error) {
    return { practices: [], error: true };
  }

  const rows = filterPublicPracticeRows(data ?? []);
  const promotionsByPractice = await loadPricePromotionsForPractices(
    supabase,
    rows.map((row) => row.id as string),
  );

  const practices = rows.map((row) => {
    const resolved = resolvePracticePrice({
      isFree: row.is_free as boolean | null,
      basePrice: row.price as number | null,
      promotions: promotionsByPractice.get(row.id as string) ?? [],
      starts: [],
      surface: PRICE_SURFACES.CATALOG,
    });
    const finalPrice = resolved.isFree
      ? (row.price as number | null)
      : resolved.finalPrice;

    return {
      id: row.id as string,
      title: row.title as string,
      slug: row.slug as string,
      subtitle: (row.subtitle as string | null) ?? null,
      format: (row.format as string | null) ?? null,
      duration_minutes: (row.duration_minutes as number | null) ?? null,
      price: finalPrice,
      is_free: resolved.isFree,
      href: buildPracticePublicPath(authorSlug, row.slug as string),
      priceLabel: resolved.isFree
        ? formatPracticePriceLabel(
            row.price as number | null,
            row.is_free as boolean | null,
          )
        : formatRubles(resolved.finalPrice),
      compareAtPriceLabel:
        !resolved.isFree && resolved.promotion
          ? formatRubles(resolved.basePrice)
          : null,
    };
  });

  return { practices, error: false };
}
