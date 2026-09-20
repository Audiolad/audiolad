import type { SupabaseClient } from "@supabase/supabase-js";

import { shouldCreateDefaultAudioItem } from "@/lib/author-products/course-builder-shared";
import { getPracticeDeleteLock } from "@/lib/author-products/delete-lock";
import { getPracticeSaleLock } from "@/lib/author-products/sale-lock";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  mapProductNormalizeJobToPrepareStatus,
  type AudioPrepareStatus,
} from "@/lib/author-products/audio-prepare-status";
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
import { isVerifiedMusicStreamAsset } from "@/lib/listen/music-delivery";
import { loadValidatedActiveMusicDeliveryItemIds } from "@/lib/listen/validated-active-music-delivery";

const PRACTICE_DETAIL_SELECT = `
  id,
  author_id,
  title,
  slug,
  subtitle,
  description,
  audio_product_author,
  format,
  product_kind,
  publication_class,
  music_usage_permission,
  studio_music_pricing_mode,
  studio_music_price_minor,
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
  primary_seo_query_id,
  seo_primary_query,
  seo_secondary_queries,
  seo_title,
  seo_description,
  seo_about,
  author_recommendations_title,
  listener_appreciation_override,
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
  updated_at,
  active_music_delivery_asset_id,
  desired_music_master_asset_id,
  desired_product_audio_normalize_job_id
`;




function asMusicStreamCandidate(asset: {
  audio_item_id: string;
  asset_role: string;
  lifecycle_state: string;
  storage_bucket: string;
  storage_path?: string | null;
}) {
  return {
    audioItemId: asset.audio_item_id,
    assetRole: asset.asset_role,
    lifecycleState: asset.lifecycle_state,
    storageBucket: asset.storage_bucket,
    storagePath: asset.storage_path ?? "",
  };
}

async function loadActiveStreamDurations(
  items: Array<{
    id: string;
    duration_seconds?: number | null;
    active_music_delivery_asset_id?: string | null;
  }>,
): Promise<Map<string, number>> {
  const need = items.filter(
    (item) =>
      item.active_music_delivery_asset_id
      && !(item.duration_seconds && item.duration_seconds > 0),
  );
  if (need.length === 0) return new Map();
  const service = createServiceRoleClient();
  const ids = need
    .map((item) => item.active_music_delivery_asset_id)
    .filter((id): id is string => Boolean(id));
  const { data, error } = await service
    .from("music_audio_assets")
    .select("id, audio_item_id, asset_role, lifecycle_state, storage_bucket, storage_path, duration_seconds")
    .in("id", ids);
  if (error) {
    console.error("active_stream_duration_lookup_failed", error.message);
    return new Map();
  }
  const out = new Map<string, number>();
  const byId = new Map((data ?? []).map((asset) => [asset.id, asset]));
  for (const item of need) {
    const asset = byId.get(item.active_music_delivery_asset_id as string);
    if (
      asset
      && asset.id === item.active_music_delivery_asset_id
      && isVerifiedMusicStreamAsset(asMusicStreamCandidate(asset), item.id)
      && typeof asset.duration_seconds === "number"
      && asset.duration_seconds > 0
    ) {
      out.set(item.id, asset.duration_seconds);
    }
  }
  return out;
}

async function loadMusicMasterStatus(
  items: Array<{
    id: string;
    audio_path?: string | null;
    desired_music_master_asset_id?: string | null;
    active_music_delivery_asset_id?: string | null;
  }>,
): Promise<Map<string, NonNullable<AudioItemRow["music_master"]>>> {
  const audioItemIds = items.map((item) => item.id);
  if (audioItemIds.length === 0) return new Map();
  const service = createServiceRoleClient();
  const { data: assets, error: assetError } = await service
    .from("music_audio_assets")
    .select("id, audio_item_id, lifecycle_state")
    .in("audio_item_id", audioItemIds)
    .eq("asset_role", "master")
    .order("created_at", { ascending: false });
  if (assetError) {
    console.error("music_master_status_lookup_failed", assetError.message);
    return new Map();
  }
  const latestByAudioItem = new Map<string, { id: string; audio_item_id: string; lifecycle_state: "uploading" | "verified" | "rejected" | "abandoned" }>();
  for (const asset of assets ?? []) {
    if (!latestByAudioItem.has(asset.audio_item_id)) {
      latestByAudioItem.set(asset.audio_item_id, asset);
    }
  }
  const desiredIds = items
    .map((item) => item.desired_music_master_asset_id)
    .filter((id): id is string => Boolean(id));
  const desiredById = new Map((assets ?? []).filter((asset) => desiredIds.includes(asset.id)).map((asset) => [asset.id, asset]));
  const chosenByAudioItem = new Map<string, { id: string; audio_item_id: string; lifecycle_state: "uploading" | "verified" | "rejected" | "abandoned" }>();
  for (const item of items) {
    if (item.desired_music_master_asset_id) {
      const desired = desiredById.get(item.desired_music_master_asset_id);
      if (desired) {
        chosenByAudioItem.set(item.id, desired);
      }
      continue;
    }
    // Current direct-MP3 mode: do not surface historical master pipeline status.
    if (item.audio_path?.trim()) {
      continue;
    }
    // Pre-Slice3 WAV-only rows may lack desired; fall back to latest master.
    const chosen = latestByAudioItem.get(item.id);
    if (chosen) {
      chosenByAudioItem.set(item.id, chosen);
    }
  }
  const assetIds = [...chosenByAudioItem.values()].map((asset) => asset.id);
  const { data: jobs } = assetIds.length
    ? await service
        .from("music_transcode_jobs")
        .select("source_asset_id, status")
        .in("source_asset_id", assetIds)
        .in("status", ["queued", "processing", "ready", "failed"])
        .order("created_at", { ascending: false })
    : { data: [] };
  const jobsBySource = new Map((jobs ?? []).map((job) => [job.source_asset_id, job.status]));
  const validatedActive = await loadValidatedActiveMusicDeliveryItemIds(items);
  const statusByItem = new Map(
    [...chosenByAudioItem.values()].map((asset) => [
      asset.audio_item_id,
      {
        assetId: asset.id,
        lifecycleState: asset.lifecycle_state,
        transcodeStatus: jobsBySource.get(asset.id) ?? null,
        hasActiveDelivery: validatedActive.has(asset.audio_item_id),
      },
    ]),
  );
  // Active stream can remain after desired master is cleared; still surface playable delivery.
  for (const item of items) {
    if (statusByItem.has(item.id)) continue;
    if (!validatedActive.has(item.id) || !item.active_music_delivery_asset_id) continue;
    statusByItem.set(item.id, {
      assetId: item.active_music_delivery_asset_id,
      lifecycleState: "verified",
      transcodeStatus: null,
      hasActiveDelivery: true,
    });
  }
  return statusByItem;
}

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


async function loadOrdinaryAudioPrepareStatuses(
  items: Array<{
    id: string;
    desired_product_audio_normalize_job_id?: string | null;
  }>,
): Promise<Map<string, AudioPrepareStatus>> {
  const ids = items
    .map((item) => item.desired_product_audio_normalize_job_id)
    .filter((id): id is string => Boolean(id));
  const map = new Map<string, AudioPrepareStatus>();
  if (ids.length === 0) return map;
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("product_audio_normalize_jobs")
    .select("id, audio_item_id, status")
    .in("id", ids);
  if (error) {
    console.error("product_audio_prepare_status_lookup_failed", error.message);
    return map;
  }
  for (const job of data ?? []) {
    const status = mapProductNormalizeJobToPrepareStatus(
      typeof job.status === "string" ? job.status : null,
    );
    if (status && typeof job.audio_item_id === "string") {
      map.set(job.audio_item_id, status);
    }
  }
  return map;
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

  const musicMasterStatus = practiceRow.product_kind === PRODUCT_KIND.MUSIC
    ? await loadMusicMasterStatus(audioItems ?? [])
    : new Map();

  const durationByActiveStream = await loadActiveStreamDurations(audioItems ?? []);
  const prepareByItem =
    practiceRow.product_kind === PRODUCT_KIND.MUSIC
      ? new Map<string, AudioPrepareStatus>()
      : await loadOrdinaryAudioPrepareStatuses(audioItems ?? []);

  return {
    practice: practiceRow,
    audio_items: (audioItems ?? []).map((item) => {
      const hydratedDuration =
        item.duration_seconds && item.duration_seconds > 0
          ? item.duration_seconds
          : durationByActiveStream.get(item.id) ?? item.duration_seconds;
      const {
        desired_product_audio_normalize_job_id: _desiredJobId,
        ...safeItem
      } = item as typeof item & {
        desired_product_audio_normalize_job_id?: string | null;
      };
      void _desiredJobId;
      return {
        ...safeItem,
        duration_seconds: hydratedDuration ?? null,
        music_master: musicMasterStatus.get(item.id) ?? null,
        audio_prepare_status: prepareByItem.get(item.id) ?? null,
      };
    }) as AudioItemRow[],
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
    audio_items: [
      (() => {
        const {
          desired_product_audio_normalize_job_id: _jobId,
          ...safeItem
        } = audioItem as typeof audioItem & {
          desired_product_audio_normalize_job_id?: string | null;
        };
        void _jobId;
        return { ...safeItem, audio_prepare_status: null };
      })() as AudioItemRow,
    ],
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
