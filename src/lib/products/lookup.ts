import { getAuthorBySlug } from "@/lib/authors/lookup";
import { shouldBlockPublicPracticeAccess } from "@/lib/fixtures/test-fixture-marker";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicPracticeAuthor = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  author_type: string | null;
};

export type PublicPracticeRow = {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  format: string | null;
  product_kind?: string | null;
  publication_class?: string | null;
  music_usage_permission?: string | null;
  duration_minutes: number | null;
  price: number | null;
  is_free: boolean | null;
  cover_url: string | null;
  cover_image?: unknown;
  use_shared_cover?: boolean | null;
  audio_url: string | null;
  status: string | null;
  updated_at: string | null;
  is_catalog_listed: boolean | null;
  guest_access_enabled?: boolean | null;
  listening_notice_enabled?: boolean | null;
  listening_notice_title?: string | null;
  listening_notice_text?: string | null;
  promo_enabled?: boolean | null;
  promo_title?: string | null;
  promo_text?: string | null;
  promo_button_text?: string | null;
  promo_url?: string | null;
  promo_open_in_new_tab?: boolean | null;
  authors: PublicPracticeAuthor | PublicPracticeAuthor[] | null;
};

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export function getPracticeAuthorSlug(
  practice: Pick<PublicPracticeRow, "authors">,
): string | null {
  const author = normalizeOne(practice.authors);
  const slug = author?.slug?.trim();

  return slug || null;
}

export async function getPracticeByAuthorAndSlug(
  supabase: SupabaseClient,
  authorSlug: string,
  productSlug: string,
): Promise<{ practice: PublicPracticeRow | null; error: boolean }> {
  const { author, error: authorError } = await getAuthorBySlug(
    supabase,
    authorSlug,
  );

  if (authorError) {
    return { practice: null, error: true };
  }

  if (!author?.id) {
    return { practice: null, error: false };
  }

  const { data, error } = await supabase
    .from("practices")
    .select(
      `
      id,
      author_id,
      title,
      slug,
      subtitle,
      description,
      format,
      product_kind,
      publication_class,
      music_usage_permission,
      duration_minutes,
      price,
      is_free,
      cover_url,
      cover_image,
      use_shared_cover,
      audio_url,
      status,
      updated_at,
      is_catalog_listed,
      guest_access_enabled,
      listening_notice_enabled,
      listening_notice_title,
      listening_notice_text,
      promo_enabled,
      promo_title,
      promo_text,
      promo_button_text,
      promo_url,
      promo_open_in_new_tab,
      authors!practices_author_id_fkey (
        id,
        name,
        slug,
        description,
        avatar_url,
        author_type
      )
    `,
    )
    .eq("author_id", author.id)
    .eq("slug", productSlug)
    .maybeSingle();

  if (error) {
    return { practice: null, error: true };
  }

  const practice = (data as PublicPracticeRow | null) ?? null;
  if (shouldBlockPublicPracticeAccess(practice)) {
    return { practice: null, error: false };
  }

  return {
    practice,
    error: false,
  };
}

export async function resolveLegacyPracticePath(
  supabase: SupabaseClient,
  legacySlug: string,
): Promise<{ authorSlug: string; productSlug: string } | null> {
  const { data: redirectRow, error: redirectError } = await supabase
    .from("practice_slug_redirects")
    .select("practice_id")
    .eq("legacy_slug", legacySlug)
    .maybeSingle();

  const redirectTableMissing =
    redirectError?.message?.includes("practice_slug_redirects") ?? false;

  if (redirectError && !redirectTableMissing) {
    throw new Error("legacy_slug_lookup_failed");
  }

  let practiceId = redirectRow?.practice_id as string | undefined;

  if (!practiceId) {
    const { data: practices, error: practiceError } = await supabase
      .from("practices")
      .select("id")
      .eq("slug", legacySlug);

    if (practiceError) {
      throw new Error("legacy_practice_lookup_failed");
    }

    if (!practices || practices.length !== 1) {
      return null;
    }

    practiceId = practices[0]?.id as string | undefined;
  }

  if (!practiceId) {
    return null;
  }

  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .select(
      `
      slug,
      cover_image,
      authors!practices_author_id_fkey (
        slug
      )
    `,
    )
    .eq("id", practiceId)
    .maybeSingle();

  if (practiceError || !practice?.slug) {
    return null;
  }

  if (shouldBlockPublicPracticeAccess(practice)) {
    return null;
  }

  const author = normalizeOne(
    (practice as { authors?: { slug?: string } | { slug?: string }[] | null })
      .authors ?? null,
  );
  const authorSlug = author?.slug?.trim();

  if (!authorSlug) {
    return null;
  }

  return {
    authorSlug,
    productSlug: practice.slug as string,
  };
}

export async function getPracticeByLegacyListenSlug(
  supabase: SupabaseClient,
  legacySlug: string,
): Promise<{ practice: PublicPracticeRow | null; error: boolean }> {
  const resolved = await resolveLegacyPracticePath(supabase, legacySlug);

  if (!resolved) {
    return { practice: null, error: false };
  }

  return getPracticeByAuthorAndSlug(
    supabase,
    resolved.authorSlug,
    resolved.productSlug,
  );
}

export async function registerPracticeLegacySlug(
  supabase: SupabaseClient,
  practiceId: string,
  legacySlug: string,
): Promise<void> {
  const trimmed = legacySlug.trim();

  if (!trimmed) {
    return;
  }

  const { error } = await supabase.from("practice_slug_redirects").upsert(
    {
      legacy_slug: trimmed,
      practice_id: practiceId,
    },
    { onConflict: "legacy_slug" },
  );

  if (error) {
    throw new Error("legacy_slug_register_failed");
  }
}
