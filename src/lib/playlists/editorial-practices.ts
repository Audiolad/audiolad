import type { SupabaseClient } from "@supabase/supabase-js";

import { getDisplayFormat } from "@/lib/author-products/format";
import { isPracticeEligibleForEditorialPlaylist } from "@/lib/playlists/editorial-content";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import { formatCatalogProductStats } from "@/lib/products/duration";
import { getProductPriceLabel, isProductFree } from "@/lib/products/price-format";
import {
  groupAudioSummariesByPractice,
  loadPublishedAudioSummaries,
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
  updated_at: string | null;
  audio_url: string | null;
  status: string | null;
  is_catalog_listed: boolean | null;
  author_id: string | null;
  authors:
    | { id: string; name: string; slug: string }
    | { id: string; name: string; slug: string }[]
    | null;
};

export type EditorialPracticeOption = {
  id: string;
  title: string;
  authorId: string;
  authorName: string;
  authorSlug: string;
  formatLabel: string | null;
  metaLabel: string | null;
  coverDisplayUrl: string | null;
  isFree: boolean;
  priceLabel: string;
  alreadyAdded: boolean;
};

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
      updated_at,
      audio_url,
      status,
      is_catalog_listed,
      author_id,
      authors!inner (
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

  const rows = (practiceRows as EditorialPracticeRow[] | null) ?? [];

  const { data: existingItems, error: itemsError } = await supabase
    .from("playlist_items")
    .select("practice_id")
    .eq("playlist_id", playlistId);

  if (itemsError) {
    return { practices: [], error: itemsError.message };
  }

  const addedSet = new Set<string>();

  for (const row of existingItems ?? []) {
    if (typeof row.practice_id === "string") {
      addedSet.add(row.practice_id);
    }
  }

  let audioSummaryMap = new Map<
    string,
    { audioCount: number; totalDurationSeconds: number }
  >();

  try {
    const summaries = await loadPublishedAudioSummaries(
      supabase,
      rows.map((row) => row.id),
    );
    audioSummaryMap = groupAudioSummariesByPractice(summaries);
  } catch {
    audioSummaryMap = new Map();
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

    practices.push({
      id: row.id,
      title: row.title.trim() || "Без названия",
      authorId: author.id,
      authorName: author.name,
      authorSlug: author.slug,
      formatLabel: getDisplayFormat(row.format),
      metaLabel: formatCatalogProductStats({
        audioCount,
        totalDurationSeconds: audioSummary?.totalDurationSeconds ?? 0,
        durationMinutesFallback: row.duration_minutes,
      }),
      coverDisplayUrl: getProductCoverDisplayUrl(
        row.cover_url,
        row.updated_at,
      ),
      isFree: isProductFree(row.is_free, row.price),
      priceLabel: getProductPriceLabel(row.price, row.is_free),
      alreadyAdded: addedSet.has(row.id),
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
    normalized.includes("invalid input")
  ) {
    return { status: 400, error: "invalid_request" };
  }

  if (
    normalized.includes("playlist_not_found") ||
    normalized.includes("practice_not_found")
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
