import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AuthorProductDetail,
  AuthorProductListItem,
  AudioItemRow,
  PracticeRow,
} from "./types";
import { slugifyTitle } from "./utils";

export const AUDIO_ITEM_DETAIL_SELECT = `
  id,
  practice_id,
  title,
  description,
  audio_path,
  cover_url,
  duration_seconds,
  original_file_name,
  file_size_bytes,
  position,
  is_preview,
  status,
  created_at,
  updated_at
`;

export async function listAuthorProducts(
  supabase: SupabaseClient,
  authorId: string,
): Promise<AuthorProductListItem[]> {
  const { data: practices, error } = await supabase
    .from("practices")
    .select(
      "id, title, slug, format, price, is_free, status, cover_url, updated_at",
    )
    .eq("author_id", authorId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error("products_list_failed");
  }

  const practiceRows = (practices ?? []) as Array<
    Omit<AuthorProductListItem, "audio_count">
  >;

  if (practiceRows.length === 0) {
    return [];
  }

  const practiceIds = practiceRows.map((row) => row.id);

  const { data: audioCounts, error: audioError } = await supabase
    .from("audio_items")
    .select("practice_id")
    .in("practice_id", practiceIds);

  if (audioError) {
    throw new Error("audio_count_failed");
  }

  const countMap = new Map<string, number>();

  for (const row of audioCounts ?? []) {
    const practiceId = row.practice_id as string;
    countMap.set(practiceId, (countMap.get(practiceId) ?? 0) + 1);
  }

  return practiceRows.map((row) => ({
    ...row,
    audio_count: countMap.get(row.id) ?? 0,
  }));
}

export async function getAuthorProductDetail(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<AuthorProductDetail | null> {
  const { data: practice, error: practiceError } = await supabase
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
      duration_minutes,
      price,
      is_free,
      cover_url,
      use_shared_cover,
      audio_url,
      status,
      currency,
      published_at,
      created_at,
      updated_at
    `,
    )
    .eq("id", practiceId)
    .maybeSingle();

  if (practiceError) {
    throw new Error("product_lookup_failed");
  }

  if (!practice?.id) {
    return null;
  }

  const { data: audioItems, error: audioError } = await supabase
    .from("audio_items")
    .select(AUDIO_ITEM_DETAIL_SELECT)
    .eq("practice_id", practiceId)
    .order("position", { ascending: true });

  if (audioError) {
    throw new Error("audio_items_lookup_failed");
  }

  return {
    practice: practice as PracticeRow,
    audio_items: (audioItems ?? []) as AudioItemRow[],
  };
}

export async function isPracticeSlugTaken(
  supabase: SupabaseClient,
  slug: string,
  authorId: string,
  excludePracticeId?: string,
): Promise<boolean> {
  let query = supabase
    .from("practices")
    .select("id")
    .eq("slug", slug)
    .eq("author_id", authorId);

  if (excludePracticeId) {
    query = query.neq("id", excludePracticeId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error("slug_lookup_failed");
  }

  return Boolean(data?.id);
}

export async function generateUniqueSlug(
  supabase: SupabaseClient,
  title: string,
  authorId: string,
  excludePracticeId?: string,
): Promise<string> {
  const baseSlug = slugifyTitle(title) || "audio-product";
  let candidate = baseSlug;
  let suffix = 2;

  while (
    await isPracticeSlugTaken(supabase, candidate, authorId, excludePracticeId)
  ) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export async function createDraftProduct(
  supabase: SupabaseClient,
  input: {
    authorId: string;
    title: string;
    slug?: string;
  },
): Promise<AuthorProductDetail> {
  const title = input.title.trim();

  if (!title) {
    throw new Error("missing_title");
  }

  const slug =
    input.slug?.trim() ||
    (await generateUniqueSlug(supabase, title, input.authorId, undefined));

  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .insert({
      author_id: input.authorId,
      title,
      slug,
      status: "draft",
      price: 0,
      is_free: true,
      currency: "RUB",
    })
    .select(
      `
      id,
      author_id,
      title,
      slug,
      subtitle,
      description,
      format,
      duration_minutes,
      price,
      is_free,
      cover_url,
      use_shared_cover,
      audio_url,
      status,
      currency,
      published_at,
      created_at,
      updated_at
    `,
    )
    .single();

  if (practiceError || !practice?.id) {
    throw new Error("draft_create_failed");
  }

  const { data: audioItem, error: audioError } = await supabase
    .from("audio_items")
    .insert({
      practice_id: practice.id,
      title: "Аудио 1",
      position: 1,
      status: "draft",
    })
    .select(AUDIO_ITEM_DETAIL_SELECT)
    .single();

  if (audioError || !audioItem?.id) {
    throw new Error("default_audio_create_failed");
  }

  return {
    practice: practice as PracticeRow,
    audio_items: [audioItem as AudioItemRow],
  };
}
