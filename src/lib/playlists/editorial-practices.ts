import type { SupabaseClient } from "@supabase/supabase-js";

import { filterPublicPracticeRows } from "@/lib/fixtures/test-fixture-marker";
import { getDisplayFormat } from "@/lib/author-products/format";
import {
  isMusicProductKind,
  normalizeProductKind,
  type ProductKind,
} from "@/lib/author-products/product-kind";
import { isPracticeEligibleForEditorialPlaylist } from "@/lib/playlists/editorial-content";
import { mapProductCoverFields, type ProductCoverFields } from "@/lib/products/cover-display";
import {
  formatAudioDuration,
  formatCatalogProductStats,
} from "@/lib/products/duration";
import { getProductPriceLabel, isProductFree } from "@/lib/products/price-format";
import {
  groupAudioSummariesByPractice,
  groupPublishedAudioItemsByPractice,
  loadPublishedAudioItemsByPracticeIds,
  loadPublishedAudioSummaries,
  type PublishedAudioItemDetail,
} from "@/lib/products/public-audio-items";

type EditorialPracticeRow = {
  id: string;
  title: string;
  slug: string;
  format: string | null;
  duration_minutes: number | null;
  price: number | null;
  is_free: boolean | null;
  cover_url: string | null;
  cover_image?: unknown;
  updated_at: string | null;
  audio_url: string | null;
  status: string | null;
  is_catalog_listed: boolean | null;
  author_id: string | null;
  product_kind: string | null;
  authors:
    | { id: string; name: string; slug: string }
    | { id: string; name: string; slug: string }[]
    | null;
};

export type EditorialPracticeTrackOption = {
  id: string;
  title: string;
  position: number;
  durationLabel: string | null;
  alreadyAdded: boolean;
};

export type EditorialPracticeOption = ProductCoverFields & {
  id: string;
  title: string;
  authorId: string;
  authorName: string;
  authorSlug: string;
  formatLabel: string | null;
  productKind: ProductKind;
  productKindLabel: "Практика" | "Музыка";
  metaLabel: string | null;
  isFree: boolean;
  priceLabel: string;
  alreadyAdded: boolean;
  tracks: EditorialPracticeTrackOption[];
};

/**
 * Music albums expand when they have any published tracks.
 * Non-music products expand only when they have more than one published audio.
 */
export function isEditorialPracticeTrackExpandable(
  productKind: ProductKind | string | null | undefined,
  trackCount: number,
): boolean {
  if (isMusicProductKind(productKind)) {
    return trackCount > 0;
  }

  return trackCount > 1;
}

export function resolveEditorialPracticeAlreadyAdded(input: {
  productKind: ProductKind | string | null | undefined;
  tracks: ReadonlyArray<{ alreadyAdded: boolean }>;
  productAlreadyAdded: boolean;
}): boolean {
  if (isMusicProductKind(input.productKind)) {
    return (
      input.tracks.length > 0 &&
      input.tracks.every((track) => track.alreadyAdded)
    );
  }

  if (isEditorialPracticeTrackExpandable(input.productKind, input.tracks.length)) {
    return input.tracks.every((track) => track.alreadyAdded);
  }

  return (
    input.productAlreadyAdded ||
    input.tracks.some((track) => track.alreadyAdded)
  );
}

function normalizeAuthor(
  authors: EditorialPracticeRow["authors"],
): { id: string; name: string; slug: string } | null {
  const author = Array.isArray(authors) ? authors[0] : authors;

  if (!author?.id || !author.name?.trim() || !author.slug?.trim()) {
    return null;
  }

  return {
    id: author.id,
    name: author.name.trim(),
    slug: author.slug.trim(),
  };
}

export async function listEditorialPracticeOptions(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<{ practices: EditorialPracticeOption[]; error: string | null }> {
  const { data: practiceRows, error: practicesError } = await supabase
    .from("practices")
    .select(
      `
      id,
      title,
      slug,
      format,
      duration_minutes,
      price,
      is_free,
      cover_url,
      cover_image,
      updated_at,
      audio_url,
      status,
      is_catalog_listed,
      author_id,
      product_kind,
      authors!practices_author_id_fkey (
        id,
        name,
        slug
      )
    `,
    )
    .eq("status", "published")
    .eq("is_catalog_listed", true)
    .not("slug", "is", null)
    .not("author_id", "is", null);

  if (practicesError) {
    return { practices: [], error: practicesError.message };
  }

  const rows = filterPublicPracticeRows(
    (practiceRows as EditorialPracticeRow[] | null) ?? [],
  );

  const { data: existingItems, error: itemsError } = await supabase
    .from("playlist_items")
    .select("practice_id, audio_item_id")
    .eq("playlist_id", playlistId);

  if (itemsError) {
    return { practices: [], error: itemsError.message };
  }

  const addedProductSet = new Set<string>();
  const addedTrackSet = new Set<string>();

  for (const row of existingItems ?? []) {
    if (typeof row.audio_item_id === "string") {
      addedTrackSet.add(row.audio_item_id);
      continue;
    }

    if (typeof row.practice_id === "string") {
      addedProductSet.add(row.practice_id);
    }
  }

  let audioSummaryMap = new Map<
    string,
    { audioCount: number; totalDurationSeconds: number }
  >();
  let tracksByPractice = new Map<string, PublishedAudioItemDetail[]>();

  try {
    const practiceIds = rows.map((row) => row.id);
    const [summaries, trackRows] = await Promise.all([
      loadPublishedAudioSummaries(supabase, practiceIds),
      loadPublishedAudioItemsByPracticeIds(supabase, practiceIds),
    ]);
    audioSummaryMap = groupAudioSummariesByPractice(summaries);
    tracksByPractice = groupPublishedAudioItemsByPractice(trackRows);
  } catch {
    audioSummaryMap = new Map();
    tracksByPractice = new Map();
  }

  const practices: EditorialPracticeOption[] = [];

  for (const row of rows) {
    const author = normalizeAuthor(row.authors);

    if (!author) {
      continue;
    }

    const audioSummary = audioSummaryMap.get(row.id);
    const audioCount = audioSummary?.audioCount ?? 0;

    if (
      !isPracticeEligibleForEditorialPlaylist(
        {
          status: row.status,
          is_catalog_listed: row.is_catalog_listed,
          slug: row.slug,
          author_id: row.author_id,
          audio_url: row.audio_url,
        },
        audioCount,
      )
    ) {
      continue;
    }

    const productKind = normalizeProductKind(row.product_kind);
    const isMusic = isMusicProductKind(productKind);
    const tracks = (tracksByPractice.get(row.id) ?? []).map((track) => ({
      id: track.id,
      title: track.title,
      position: track.position,
      durationLabel: formatAudioDuration(track.durationSeconds),
      alreadyAdded: addedTrackSet.has(track.id),
    }));

    practices.push({
      id: row.id,
      title: row.title.trim() || "Без названия",
      authorId: author.id,
      authorName: author.name,
      authorSlug: author.slug,
      formatLabel: getDisplayFormat(row.format),
      productKind,
      productKindLabel: isMusic ? "Музыка" : "Практика",
      metaLabel: formatCatalogProductStats({
        audioCount,
        totalDurationSeconds: audioSummary?.totalDurationSeconds ?? 0,
        durationMinutesFallback: row.duration_minutes,
      }),
      ...mapProductCoverFields(row),
      isFree: isProductFree(row.is_free, row.price),
      priceLabel: getProductPriceLabel(row.price, row.is_free),
      alreadyAdded: resolveEditorialPracticeAlreadyAdded({
        productKind,
        tracks,
        productAlreadyAdded: addedProductSet.has(row.id),
      }),
      tracks,
    });
  }

  practices.sort((left, right) =>
    left.title.localeCompare(right.title, "ru"),
  );

  return { practices, error: null };
}

export type EditorialAddRpcResult = {
  playlist_id: string;
  added: number;
  skipped: number;
  practice_ids: string[];
};

export function isEditorialAddRpcResult(
  value: unknown,
): value is EditorialAddRpcResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as EditorialAddRpcResult;

  return (
    typeof row.playlist_id === "string" &&
    typeof row.added === "number" &&
    typeof row.skipped === "number" &&
    Array.isArray(row.practice_ids)
  );
}

export function mapEditorialAddRpcError(message: string): {
  status: number;
  error: string;
  message?: string;
} {
  const normalized = message.toLowerCase();

  if (normalized.includes("not_authenticated")) {
    return { status: 401, error: "unauthorized" };
  }

  if (normalized.includes("forbidden")) {
    return { status: 403, error: "forbidden" };
  }

  if (
    normalized.includes("playlist_id_required") ||
    normalized.includes("practice_ids_required") ||
    normalized.includes("practice_ids_limit") ||
    normalized.includes("duplicate_practice_ids") ||
    normalized.includes("duplicate_audio_item_ids") ||
    normalized.includes("audio_item_ids_required") ||
    normalized.includes("audio_item_practice_mismatch") ||
    normalized.includes("invalid input")
  ) {
    return { status: 400, error: "invalid_request" };
  }

  if (
    normalized.includes("playlist_not_found") ||
    normalized.includes("practice_not_found") ||
    normalized.includes("audio_item_not_found")
  ) {
    return { status: 404, error: "not_found" };
  }

  if (normalized.includes("not_editorial_playlist")) {
    return {
      status: 409,
      error: "not_editorial_playlist",
      message: "Это не редакционный плейлист АудиоЛада.",
    };
  }

  if (
    normalized.includes("practice_not_publishable") ||
    normalized.includes("practice_not_playable")
  ) {
    return {
      status: 409,
      error: "practice_not_publishable",
      message: "Можно добавлять только опубликованные материалы из каталога.",
    };
  }

  if (normalized.includes("items_limit_reached")) {
    return {
      status: 409,
      error: "limit_reached",
      message: "В плейлисте может быть не больше 100 материалов.",
    };
  }

  return { status: 500, error: "internal_error" };
}

export type EditorialReplaceRpcResult = {
  playlist_id: string;
  position: number;
  old_practice_id: string;
  new_practice_id: string;
  replaced: boolean;
};

export function isEditorialReplaceRpcResult(
  value: unknown,
): value is EditorialReplaceRpcResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as EditorialReplaceRpcResult;

  return (
    typeof row.playlist_id === "string" &&
    typeof row.position === "number" &&
    typeof row.old_practice_id === "string" &&
    typeof row.new_practice_id === "string" &&
    typeof row.replaced === "boolean"
  );
}

export function mapEditorialReplaceRpcError(message: string): {
  status: number;
  error: string;
  message?: string;
} {
  const normalized = message.toLowerCase();

  if (normalized.includes("not_authenticated")) {
    return { status: 401, error: "unauthorized" };
  }

  if (normalized.includes("forbidden")) {
    return { status: 403, error: "forbidden" };
  }

  if (
    normalized.includes("playlist_id_required") ||
    normalized.includes("practice_id_required") ||
    normalized.includes("audio_item_practice_mismatch") ||
    normalized.includes("invalid input")
  ) {
    return { status: 400, error: "invalid_request" };
  }

  if (
    normalized.includes("playlist_not_found") ||
    normalized.includes("practice_not_found") ||
    normalized.includes("audio_item_not_found") ||
    normalized.includes("item_not_found")
  ) {
    return { status: 404, error: "not_found" };
  }

  if (normalized.includes("not_editorial_playlist")) {
    return {
      status: 409,
      error: "not_editorial_playlist",
      message: "Это не редакционный плейлист АудиоЛада.",
    };
  }

  if (normalized.includes("already_in_playlist")) {
    return {
      status: 409,
      error: "already_in_playlist",
      message: "Этот материал уже есть в плейлисте.",
    };
  }

  if (
    normalized.includes("practice_not_publishable") ||
    normalized.includes("practice_not_playable")
  ) {
    return {
      status: 409,
      error: "practice_not_publishable",
      message: "Можно добавлять только опубликованные материалы из каталога.",
    };
  }

  return { status: 500, error: "internal_error" };
}
