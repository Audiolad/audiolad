import type { SupabaseClient } from "@supabase/supabase-js";

import {
  filterPublicPracticeRows,
  isFixtureMarkedAuthor,
} from "@/lib/fixtures/test-fixture-marker";

import { buildPracticePublicPath } from "@/lib/products/paths";
import { getProductPriceLabel } from "@/lib/products/price-format";

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
    .order("created_at", { ascending: false });

  if (error) {
    return { practices: [], error: true };
  }

  const practices = filterPublicPracticeRows(data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    slug: row.slug as string,
    subtitle: (row.subtitle as string | null) ?? null,
    format: (row.format as string | null) ?? null,
    duration_minutes: (row.duration_minutes as number | null) ?? null,
    price: (row.price as number | null) ?? null,
    is_free: (row.is_free as boolean | null) ?? null,
    href: buildPracticePublicPath(authorSlug, row.slug as string),
    priceLabel: formatPracticePriceLabel(
      row.price as number | null,
      row.is_free as boolean | null,
    ),
  }));

  return { practices, error: false };
}
