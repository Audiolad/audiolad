import type { SupabaseClient } from "@supabase/supabase-js";

import { getPracticeSaleLock } from "@/lib/author-products/sale-lock";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  MUSIC_USAGE_PERMISSION,
  PRODUCT_KIND,
  normalizeProductKind,
  type ProductKind,
} from "./product-kind";
import type {
  AuthorProductDetail,
  AuthorProductListItem,
  AudioItemRow,
  PracticeRow,
} from "./types";
import { coercePracticeRow } from "./types";
import { slugifyTitle } from "./utils";

const PRACTICE_DETAIL_SELECT = `
  id,
  author_id,
  title,
  slug,
  subtitle,
  description,
  format,
  product_kind,
  music_usage_permission,
  duration_minutes,
  price,
  is_free,
  cover_url,
  cover_image,
  use_shared_cover,
  audio_url,
  status,
  currency,
  published_at,
  listening_notice_enabled,
  listening_notice_title,
  listening_notice_text,
  created_at,
  updated_at
`;

async function resolveContentLockedAfterSale(
  practiceId: string,
): Promise<boolean> {
  try {
    const serviceSupabase = createServiceRoleClient();
    const lock = await getPracticeSaleLock(serviceSupabase, practiceId);
    return lock.locked;
  } catch (error) {
    console.error("practice_sale_lock_lookup_failed", practiceId, error);
    throw new Error("sale_lock_lookup_failed");
  }
}

export const AUDIO_ITEM_DETAIL_SELECT = `
  id,
  practice_id,
  title,
  description,
  audio_path,
  cover_url,
  cover_image,
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
      "id, title, slug, format, product_kind, price, is_free, status, cover_url, cover_image, updated_at",
    )
    .eq("author_id", authorId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error("products_list_failed");
  }

  const practiceRows = (practices ?? []) as Array<
    Omit<AuthorProductListItem, "audio_count" | "product_kind"> & {
      product_kind?: string | null;
    }
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
    product_kind: normalizeProductKind(row.product_kind),
    audio_count: countMap.get(row.id) ?? 0,
  }));
}

export async function getAuthorProductDetail(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<AuthorProductDetail | null> {
  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .select(PRACTICE_DETAIL_SELECT)
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

  const contentLockedAfterSale = await resolveContentLockedAfterSale(practiceId);

  return {
    practice: coercePracticeRow(practice as PracticeRow),
    audio_items: (audioItems ?? []) as AudioItemRow[],
    contentLockedAfterSale,
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
    productKind?: ProductKind;
  },
): Promise<AuthorProductDetail> {
  const title = input.title.trim();

  if (!title) {
    throw new Error("missing_title");
  }

  const productKind = normalizeProductKind(input.productKind);
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
      product_kind: productKind,
      music_usage_permission:
        productKind === PRODUCT_KIND.MUSIC
          ? MUSIC_USAGE_PERMISSION.LISTEN_ONLY
          : null,
      format:
        productKind === PRODUCT_KIND.MUSIC ? "Музыкальный трек" : null,
    })
    .select(PRACTICE_DETAIL_SELECT)
    .single();

  if (practiceError || !practice?.id) {
    throw new Error("draft_create_failed");
  }

  const { data: audioItem, error: audioError } = await supabase
    .from("audio_items")
    .insert({
      practice_id: practice.id,
      title: productKind === PRODUCT_KIND.MUSIC ? "Трек 1" : "Аудио 1",
      position: 1,
      status: "draft",
    })
    .select(AUDIO_ITEM_DETAIL_SELECT)
    .single();

  if (audioError || !audioItem?.id) {
    throw new Error("default_audio_create_failed");
  }

  return {
    practice: coercePracticeRow(practice as PracticeRow),
    audio_items: [audioItem as AudioItemRow],
    contentLockedAfterSale: false,
  };
}
