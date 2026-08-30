import type { SupabaseClient } from "@supabase/supabase-js";

import { shouldCreateDefaultAudioItem } from "@/lib/author-products/course-builder-shared";
import { getPracticeDeleteLock } from "@/lib/author-products/delete-lock";
import { getPracticeSaleLock } from "@/lib/author-products/sale-lock";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadAuthorPracticeSeoContent } from "@/lib/products/practice-seo-content";

import {
  AUDIO_POST_KIND_LABEL,
  MUSIC_KIND_LABEL,
  MUSIC_USAGE_PERMISSION,
  PRODUCT_KIND,
  normalizeProductKind,
  type ProductKind,
} from "./product-kind";
import { listAuthorGallerySlides } from "./gallery";
import {
  isProductGalleryEligible,
  resolveCreateClassification,
  type CabinetBranch,
  type PublicationClass,
} from "./publication-class";
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
  publication_class,
  music_usage_permission,
  duration_minutes,
  price,
  is_free,
  is_catalog_listed,
  catalog_visibility,
  cover_url,
  cover_image,
  use_shared_cover,
  audio_url,
  status,
  moderation_status,
  moderation_attempt,
  moderation_submitted_at,
  moderation_review_comment,
  deleted_at,
  deleted_by,
  deletion_reason,
  currency,
  published_at,
  listening_notice_enabled,
  listening_notice_title,
  listening_notice_text,
  promo_enabled,
  promo_title,
  promo_text,
  promo_button_text,
  promo_url,
  promo_open_in_new_tab,
  seo_primary_query,
  seo_secondary_queries,
  seo_title,
  seo_description,
  seo_about,
  author_recommendations_title,
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

async function resolveDeleteLockedAfterPaidPurchase(
  practiceId: string,
): Promise<boolean> {
  try {
    const serviceSupabase = createServiceRoleClient();
    const lock = await getPracticeDeleteLock(serviceSupabase, practiceId);
    return lock.locked;
  } catch (error) {
    console.error("practice_delete_lock_lookup_failed", practiceId, error);
    throw new Error("delete_lock_lookup_failed");
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
      "id, title, slug, format, product_kind, publication_class, price, is_free, status, moderation_status, moderation_submitted_at, moderation_review_comment, moderation_attempt, cover_url, cover_image, updated_at",
    )
    .eq("author_id", authorId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error("products_list_failed");
  }

  const practiceRows = (practices ?? []) as Array<
    Omit<AuthorProductListItem, "audio_count" | "product_kind"> & {
      product_kind?: string | null;
      moderation_status?: string | null;
      moderation_submitted_at?: string | null;
      moderation_review_comment?: string | null;
      moderation_attempt?: number | null;
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
    moderation_status: row.moderation_status ?? "not_submitted",
    moderation_submitted_at: row.moderation_submitted_at ?? null,
    moderation_review_comment: row.moderation_review_comment ?? null,
    moderation_attempt: row.moderation_attempt ?? 0,
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
    .is("deleted_at", null)
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

  const practiceRow = coercePracticeRow(practice as PracticeRow);
  const [contentLockedAfterSale, deleteLockedAfterPaidPurchase, gallerySlides, seoContent] =
    await Promise.all([
      resolveContentLockedAfterSale(practiceId),
      resolveDeleteLockedAfterPaidPurchase(practiceId),
      isProductGalleryEligible(
        practiceRow.publication_class,
        practiceRow.product_kind,
      )
        ? listAuthorGallerySlides(supabase, practiceId).catch(() => [])
        : Promise.resolve([]),
      loadAuthorPracticeSeoContent(supabase, practiceId),
    ]);

  return {
    practice: practiceRow,
    audio_items: (audioItems ?? []) as AudioItemRow[],
    gallery_slides: gallerySlides,
    seo_content: seoContent,
    contentLockedAfterSale,
    deleteLockedAfterPaidPurchase,
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
    publicationClass?: PublicationClass | string | null;
    cabinetBranch?: CabinetBranch | string | null;
  },
): Promise<AuthorProductDetail> {
  const title = input.title.trim();

  if (!title) {
    throw new Error("missing_title");
  }

  const classification = resolveCreateClassification({
    publicationClass: input.publicationClass,
    cabinetBranch: input.cabinetBranch,
    productKind: input.productKind,
  });

  if (!classification.ok) {
    throw new Error(classification.error);
  }

  const productKind = classification.value.productKind;
  const publicationClass = classification.value.publicationClass;
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
      publication_class: publicationClass,
      music_usage_permission:
        productKind === PRODUCT_KIND.MUSIC
          ? MUSIC_USAGE_PERMISSION.LISTEN_ONLY
          : null,
      format:
        productKind === PRODUCT_KIND.MUSIC
          ? MUSIC_KIND_LABEL
          : productKind === PRODUCT_KIND.AUDIO_POST
            ? AUDIO_POST_KIND_LABEL
            : null,
    })
    .select(PRACTICE_DETAIL_SELECT)
    .single();

  if (practiceError || !practice?.id) {
    throw new Error("draft_create_failed");
  }

  if (!shouldCreateDefaultAudioItem(publicationClass)) {
    return {
      practice: coercePracticeRow(practice as PracticeRow),
      audio_items: [],
      gallery_slides: [],
      seo_content: {
        usageItems: [],
        faqItems: [],
        relatedPracticeIds: [],
        relatedListenSlugs: [],
      },
      contentLockedAfterSale: false,
      deleteLockedAfterPaidPurchase: false,
    };
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
    gallery_slides: [],
    seo_content: {
      usageItems: [],
      faqItems: [],
      relatedPracticeIds: [],
      relatedListenSlugs: [],
    },
    contentLockedAfterSale: false,
    deleteLockedAfterPaidPurchase: false,
  };
}
