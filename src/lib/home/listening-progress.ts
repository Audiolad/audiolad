import type { SupabaseClient } from "@supabase/supabase-js";

import {
  calculateProgramProgressPercent,
  isTrackCompleted,
  resolveInitialPlayback,
} from "@/lib/listen/progress";
import type { ListenProgressEntry } from "@/lib/listen/types";
import { formatAudioDuration } from "@/lib/products/duration";
import { buildListenPath } from "@/lib/products/paths";
import { mapProductCoverFields } from "@/lib/products/cover-display";
import {
  groupAudioSummariesByPractice,
  loadPublishedAudioSummaries,
} from "@/lib/products/public-audio-items";

import type {
  ActiveProgramItem,
  ContinueListeningItem,
  HomeProduct,
} from "./types";

type PracticeAuthorRow = {
  name: string;
  slug: string;
} | null;

type PracticeRow = {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  format: string | null;
  duration_minutes: number | null;
  price: number | null;
  is_free: boolean | null;
  cover_url: string | null;
  cover_image?: unknown;
  updated_at: string | null;
  published_at: string | null;
  created_at: string | null;
  authors: PracticeAuthorRow | PracticeAuthorRow[];
};

type ProgressRow = {
  practice_id: string;
  audio_item_id: string;
  position_seconds: number;
  completed: boolean;
  updated_at: string;
};

type AudioItemRow = {
  id: string;
  title: string;
  duration_seconds: number | null;
  position: number;
};

function normalizeAuthor(
  authors: PracticeRow["authors"],
): { name: string; slug: string } | null {
  const author = Array.isArray(authors) ? authors[0] : authors;

  if (!author?.slug?.trim() || !author?.name?.trim()) {
    return null;
  }

  return {
    name: author.name.trim(),
    slug: author.slug.trim(),
  };
}

function getSortTimestamp(
  publishedAt: string | null,
  createdAt: string | null,
): number {
  const publishedTime = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  const createdTime = createdAt ? Date.parse(createdAt) : Number.NaN;

  if (Number.isFinite(publishedTime)) {
    return publishedTime;
  }

  if (Number.isFinite(createdTime)) {
    return createdTime;
  }

  return 0;
}

function mapPracticeToHomeProduct(
  practice: PracticeRow,
  audioSummaryMap: Map<
    string,
    { audioCount: number; totalDurationSeconds: number }
  >,
  catalogProductMap: Map<string, HomeProduct>,
): HomeProduct | null {
  const catalogProduct = catalogProductMap.get(practice.id);

  if (catalogProduct) {
    return catalogProduct;
  }

  const author = normalizeAuthor(practice.authors);

  if (!author) {
    return null;
  }

  const audioSummary = audioSummaryMap.get(practice.id);
  const audioCount = audioSummary?.audioCount ?? 0;

  return {
    id: practice.id,
    title: practice.title,
    slug: practice.slug,
    subtitle: practice.subtitle?.trim() || null,
    description: practice.description?.trim() || null,
    format: practice.format?.trim() || null,
    price: practice.price,
    isFree: practice.is_free === true,
    ...mapProductCoverFields(practice),
    authorName: author.name,
    authorSlug: author.slug,
    href: `/practice/${author.slug}/${practice.slug}`,
    meta: null,
    statsLabel: null,
    productTypeLabel: audioCount >= 2 ? "Программа аудиопрактик" : "Аудиопрактика",
    priceLabel: practice.is_free ? "Подарок" : `${practice.price ?? 0} ₽`,
    sortTimestamp: getSortTimestamp(practice.published_at, practice.created_at),
    audioCount,
    listenHref: buildListenPath(author.slug, practice.slug, { autoplay: true }),
  };
}

function buildProgressLabel(
  tracks: Array<{ id: string; durationSeconds: number | null }>,
  progress: ListenProgressEntry[],
  currentTrackId: string,
  currentTime: number,
): string {
  const currentTrack = tracks.find((track) => track.id === currentTrackId);
  const duration = currentTrack?.durationSeconds ?? 0;

  if (duration > 0) {
    const remaining = Math.max(0, duration - currentTime);

    if (remaining <= 2) {
      return "Прослушано полностью";
    }

    const formatted = formatAudioDuration(remaining);

    if (formatted) {
      return `Осталось ${formatted}`;
    }
  }

  const entry = progress.find((item) => item.audioItemId === currentTrackId);

  if (entry?.completed) {
    return "Прослушано полностью";
  }

  if (entry && entry.positionSeconds > 0) {
    const formatted = formatAudioDuration(entry.positionSeconds);

    if (formatted) {
      return `Прослушано ${formatted}`;
    }
  }

  return "Продолжить с того же места";
}

async function loadPracticeTracks(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<Array<{ id: string; title: string; durationSeconds: number | null }>> {
  const { data, error } = await supabase
    .from("audio_items")
    .select("id, title, duration_seconds, position")
    .eq("practice_id", practiceId)
    .eq("status", "published")
    .order("position", { ascending: true });

  if (error) {
    return [];
  }

  return ((data ?? []) as AudioItemRow[]).map((item) => ({
    id: item.id,
    title: item.title,
    durationSeconds: item.duration_seconds,
  }));
}

async function buildContinueListeningItem(
  supabase: SupabaseClient,
  practice: PracticeRow,
  progressRows: ProgressRow[],
  catalogProductMap: Map<string, HomeProduct>,
  audioSummaryMap: Map<
    string,
    { audioCount: number; totalDurationSeconds: number }
  >,
): Promise<ContinueListeningItem | null> {
  const product = mapPracticeToHomeProduct(
    practice,
    audioSummaryMap,
    catalogProductMap,
  );

  if (!product?.authorSlug) {
    return null;
  }

  const tracks = await loadPracticeTracks(supabase, practice.id);

  if (tracks.length === 0) {
    return null;
  }

  const progress: ListenProgressEntry[] = progressRows.map((row) => ({
    audioItemId: row.audio_item_id,
    positionSeconds: row.position_seconds,
    completed: row.completed,
  }));

  const initial = resolveInitialPlayback(tracks, progress);

  if (initial.allCompleted) {
    return null;
  }

  const currentTrack = tracks[initial.trackIndex];
  const isProgram = tracks.length >= 2;
  const progressPercent = calculateProgramProgressPercent(
    tracks,
    progress,
    currentTrack.id,
    initial.positionSeconds,
  );

  return {
    product,
    listenHref: buildListenPath(product.authorSlug, product.slug, {
      autoplay: true,
    }),
    isProgram,
    trackIndex: initial.trackIndex,
    trackCount: tracks.length,
    currentTrackTitle: currentTrack.title?.trim() || null,
    progressPercent,
    progressLabel: buildProgressLabel(
      tracks,
      progress,
      currentTrack.id,
      initial.positionSeconds,
    ),
    stepLabel: isProgram
      ? `Шаг ${initial.trackIndex + 1} из ${tracks.length}`
      : null,
  };
}

export async function getContinueListening(
  supabase: SupabaseClient,
  userId: string,
  catalogProductMap: Map<string, HomeProduct>,
  audioSummaryMap: Map<
    string,
    { audioCount: number; totalDurationSeconds: number }
  >,
): Promise<ContinueListeningItem | null> {
  const { data: progressRows, error } = await supabase
    .from("practice_audio_progress")
    .select("practice_id, audio_item_id, position_seconds, completed, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error || !progressRows?.length) {
    return null;
  }

  const practiceIds = [
    ...new Set(
      (progressRows as ProgressRow[]).map((row) => row.practice_id),
    ),
  ];

  const { data: practices, error: practicesError } = await supabase
    .from("practices")
    .select(
      `
      id,
      title,
      slug,
      subtitle,
      description,
      format,
      duration_minutes,
      price,
      is_free,
      cover_url,
      cover_image,
      updated_at,
      published_at,
      created_at,
      authors!practices_author_id_fkey (name, slug)
    `,
    )
    .in("id", practiceIds);

  if (practicesError || !practices?.length) {
    return null;
  }

  const practiceMap = new Map(
    (practices as PracticeRow[]).map((practice) => [practice.id, practice]),
  );

  for (const practiceId of practiceIds) {
    const practice = practiceMap.get(practiceId);

    if (!practice) {
      continue;
    }

    const practiceProgress = (progressRows as ProgressRow[]).filter(
      (row) => row.practice_id === practiceId,
    );

    const item = await buildContinueListeningItem(
      supabase,
      practice,
      practiceProgress,
      catalogProductMap,
      audioSummaryMap,
    );

    if (item) {
      return item;
    }
  }

  return null;
}

export async function getRecentlyListenedProducts(
  supabase: SupabaseClient,
  userId: string,
  catalogProductMap: Map<string, HomeProduct>,
  audioSummaryMap: Map<
    string,
    { audioCount: number; totalDurationSeconds: number }
  >,
  limit = 6,
): Promise<HomeProduct[]> {
  const { data: progressRows, error } = await supabase
    .from("practice_audio_progress")
    .select("practice_id, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error || !progressRows?.length) {
    return [];
  }

  const seen = new Set<string>();
  const orderedPracticeIds: string[] = [];

  for (const row of progressRows as Array<{
    practice_id: string;
    updated_at: string;
  }>) {
    if (seen.has(row.practice_id)) {
      continue;
    }

    seen.add(row.practice_id);
    orderedPracticeIds.push(row.practice_id);

    if (orderedPracticeIds.length >= limit) {
      break;
    }
  }

  if (orderedPracticeIds.length === 0) {
    return [];
  }

  const { data: practices, error: practicesError } = await supabase
    .from("practices")
    .select(
      `
      id,
      title,
      slug,
      subtitle,
      description,
      format,
      duration_minutes,
      price,
      is_free,
      cover_url,
      cover_image,
      updated_at,
      published_at,
      created_at,
      authors!practices_author_id_fkey (name, slug)
    `,
    )
    .in("id", orderedPracticeIds);

  if (practicesError || !practices?.length) {
    return [];
  }

  const practiceMap = new Map(
    (practices as PracticeRow[]).map((practice) => [practice.id, practice]),
  );

  return orderedPracticeIds.flatMap((practiceId) => {
    const practice = practiceMap.get(practiceId);

    if (!practice) {
      return [];
    }

    const product = mapPracticeToHomeProduct(
      practice,
      audioSummaryMap,
      catalogProductMap,
    );

    return product ? [product] : [];
  });
}

export async function getActivePrograms(
  supabase: SupabaseClient,
  userId: string,
  catalogProductMap: Map<string, HomeProduct>,
  audioSummaryMap: Map<
    string,
    { audioCount: number; totalDurationSeconds: number }
  >,
): Promise<ActiveProgramItem[]> {
  const { data: progressRows, error } = await supabase
    .from("practice_audio_progress")
    .select("practice_id, audio_item_id, position_seconds, completed, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error || !progressRows?.length) {
    return [];
  }

  const practiceIds = [
    ...new Set(
      (progressRows as ProgressRow[]).map((row) => row.practice_id),
    ),
  ];

  const multiTrackPracticeIds = practiceIds.filter((practiceId) => {
    const summary = audioSummaryMap.get(practiceId);
    return (summary?.audioCount ?? 0) >= 2;
  });

  if (multiTrackPracticeIds.length === 0) {
    return [];
  }

  const { data: practices, error: practicesError } = await supabase
    .from("practices")
    .select(
      `
      id,
      title,
      slug,
      subtitle,
      description,
      format,
      duration_minutes,
      price,
      is_free,
      cover_url,
      cover_image,
      updated_at,
      published_at,
      created_at,
      authors!practices_author_id_fkey (name, slug)
    `,
    )
    .in("id", multiTrackPracticeIds);

  if (practicesError || !practices?.length) {
    return [];
  }

  const items: ActiveProgramItem[] = [];

  for (const practice of practices as PracticeRow[]) {
    const product = mapPracticeToHomeProduct(
      practice,
      audioSummaryMap,
      catalogProductMap,
    );

    if (!product?.authorSlug) {
      continue;
    }

    const tracks = await loadPracticeTracks(supabase, practice.id);

    if (tracks.length < 2) {
      continue;
    }

    const practiceProgress = (progressRows as ProgressRow[]).filter(
      (row) => row.practice_id === practice.id,
    );

    const progress: ListenProgressEntry[] = practiceProgress.map((row) => ({
      audioItemId: row.audio_item_id,
      positionSeconds: row.position_seconds,
      completed: row.completed,
    }));

    const initial = resolveInitialPlayback(tracks, progress);

    if (initial.allCompleted) {
      continue;
    }

    const currentTrack = tracks[initial.trackIndex];

    items.push({
      product,
      listenHref: buildListenPath(product.authorSlug, product.slug, {
        autoplay: true,
      }),
      trackIndex: initial.trackIndex,
      trackCount: tracks.length,
      progressPercent: calculateProgramProgressPercent(
        tracks,
        progress,
        currentTrack.id,
        initial.positionSeconds,
      ),
      stepLabel: `Шаг ${initial.trackIndex + 1} из ${tracks.length}`,
    });
  }

  return items;
}

export async function loadAudioSummaryMap(
  supabase: SupabaseClient,
  practiceIds: string[],
): Promise<Map<string, { audioCount: number; totalDurationSeconds: number }>> {
  if (practiceIds.length === 0) {
    return new Map();
  }

  try {
    const summaries = await loadPublishedAudioSummaries(supabase, practiceIds);
    return groupAudioSummariesByPractice(summaries);
  } catch {
    return new Map();
  }
}

export function enrichCatalogProducts(
  products: Array<{
    id: string;
    title: string;
    slug: string;
    subtitle: string | null;
    description: string | null;
    format: string | null;
    price: number | null;
    isFree: boolean;
    coverUrl: string | null;
    authorName: string | null;
    authorSlug: string | null;
    href: string;
    meta: string | null;
    statsLabel: string | null;
    productTypeLabel: string;
    priceLabel: string;
    sortTimestamp: number;
  }>,
  audioSummaryMap: Map<
    string,
    { audioCount: number; totalDurationSeconds: number }
  >,
): HomeProduct[] {
  return products.map((product) => ({
    ...product,
    audioCount: audioSummaryMap.get(product.id)?.audioCount ?? 0,
    listenHref:
      product.authorSlug && product.slug
        ? buildListenPath(product.authorSlug, product.slug, { autoplay: true })
        : null,
  }));
}

export function excludeProducts(
  products: HomeProduct[],
  excludedIds: Set<string>,
): HomeProduct[] {
  return products.filter((product) => !excludedIds.has(product.id));
}

export function takeUniqueProducts(
  sources: HomeProduct[][],
  limit: number,
): HomeProduct[] {
  const seen = new Set<string>();
  const result: HomeProduct[] = [];

  for (const source of sources) {
    for (const product of source) {
      if (seen.has(product.id)) {
        continue;
      }

      seen.add(product.id);
      result.push(product);

      if (result.length >= limit) {
        return result;
      }
    }
  }

  return result;
}

export function isProgramProduct(product: HomeProduct): boolean {
  return product.audioCount >= 2;
}

export function hasIncompleteProgress(
  tracks: Array<{ id: string; durationSeconds: number | null }>,
  progress: ListenProgressEntry[],
): boolean {
  const initial = resolveInitialPlayback(tracks, progress);
  return !initial.allCompleted;
}

export { isTrackCompleted };
