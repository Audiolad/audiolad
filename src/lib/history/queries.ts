import type { SupabaseClient } from "@supabase/supabase-js";

import { getDisplayFormat } from "@/lib/author-products/format";
import {
  calculateProgramProgressPercent,
  resolveInitialPlayback,
} from "@/lib/listen/progress";
import type { ListenProgressEntry } from "@/lib/listen/types";
import { resolveProductAccess } from "@/lib/products/access";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import { formatAudioDuration, formatProductMeta } from "@/lib/products/duration";
import {
  buildListenPath,
  buildPracticePublicPath,
} from "@/lib/products/paths";
import {
  groupAudioSummariesByPractice,
  loadPublishedAudioSummaries,
} from "@/lib/products/public-audio-items";

import { formatHistoryActivityLabel, getCompletedStatusLabel } from "./format";
import {
  aggregateProgressByPractice,
  filterHistoryItems,
  groupHistoryItems,
  parseHistoryFilter,
} from "./logic";
import type {
  HistoryItem,
  HistoryItemStatus,
  HistoryPageViewModel,
  HistoryProgressRow,
} from "./types";

type PracticeAuthorRow = {
  name: string;
  slug: string;
} | null;

type PracticeRow = {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  format: string | null;
  duration_minutes: number | null;
  cover_url: string | null;
  updated_at: string | null;
  is_free: boolean | null;
  status: string | null;
  is_catalog_listed: boolean | null;
  guest_access_enabled: boolean | null;
  authors: PracticeAuthorRow | PracticeAuthorRow[];
};

type AudioItemRow = {
  id: string;
  practice_id: string;
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

function buildProgressLabel(
  tracks: Array<{ id: string; durationSeconds: number | null }>,
  progress: ListenProgressEntry[],
  currentTrackId: string,
  currentTime: number,
  completed: boolean,
): string {
  if (completed) {
    return getCompletedStatusLabel();
  }

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

function buildHistoryAction(input: {
  canListen: boolean;
  completed: boolean;
  authorSlug: string | null;
  productSlug: string;
  productHref: string | null;
}): { actionLabel: string; actionHref: string } {
  if (input.canListen && input.authorSlug) {
    return {
      actionLabel: input.completed ? "Слушать снова" : "Продолжить",
      actionHref: buildListenPath(input.authorSlug, input.productSlug, {
        autoplay: true,
      }),
    };
  }

  if (input.productHref) {
    return {
      actionLabel: "Открыть страницу",
      actionHref: input.productHref,
    };
  }

  return {
    actionLabel: "Перейти в каталог",
    actionHref: "/catalog",
  };
}

async function loadPracticeTracksMap(
  supabase: SupabaseClient,
  practiceIds: string[],
): Promise<Map<string, AudioItemRow[]>> {
  if (practiceIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("audio_items")
    .select("id, practice_id, title, duration_seconds, position")
    .in("practice_id", practiceIds)
    .eq("status", "published")
    .order("position", { ascending: true });

  if (error) {
    throw new Error("history_audio_items_failed");
  }

  const map = new Map<string, AudioItemRow[]>();

  for (const row of (data ?? []) as AudioItemRow[]) {
    const current = map.get(row.practice_id) ?? [];
    current.push(row);
    map.set(row.practice_id, current);
  }

  return map;
}

async function buildHistoryItem(
  supabase: SupabaseClient,
  userId: string,
  practice: PracticeRow,
  progressRows: HistoryProgressRow[],
  tracks: AudioItemRow[],
  audioSummary: { audioCount: number; totalDurationSeconds: number } | null,
): Promise<HistoryItem | null> {
  if (tracks.length === 0) {
    return null;
  }

  const author = normalizeAuthor(practice.authors);

  if (!author) {
    return null;
  }

  const normalizedTracks = tracks.map((track) => ({
    id: track.id,
    durationSeconds: track.duration_seconds,
  }));

  const progress: ListenProgressEntry[] = progressRows.map((row) => ({
    audioItemId: row.audio_item_id,
    positionSeconds: row.position_seconds,
    completed: row.completed,
  }));

  const initial = resolveInitialPlayback(normalizedTracks, progress);
  const completed = initial.allCompleted;
  const status: HistoryItemStatus = completed ? "completed" : "in-progress";
  const currentTrack = normalizedTracks[initial.trackIndex];
  const progressPercent = completed
    ? 100
    : calculateProgramProgressPercent(
        normalizedTracks,
        progress,
        currentTrack.id,
        initial.positionSeconds,
      );

  const lastUpdatedAt = progressRows.reduce((latest, row) => {
    return Date.parse(row.updated_at) > Date.parse(latest)
      ? row.updated_at
      : latest;
  }, progressRows[0]!.updated_at);

  const access = await resolveProductAccess(
    supabase,
    {
      id: practice.id,
      author_id: practice.author_id,
      is_free: practice.is_free,
      status: practice.status,
      is_catalog_listed: practice.is_catalog_listed,
      guest_access_enabled: practice.guest_access_enabled,
    },
    userId,
  );

  const productHref = buildPracticePublicPath(author.slug, practice.slug);
  const { actionLabel, actionHref } = buildHistoryAction({
    canListen: access.canListen,
    completed,
    authorSlug: author.slug,
    productSlug: practice.slug,
    productHref,
  });

  const audioCount = audioSummary?.audioCount ?? tracks.length;

  return {
    practiceId: practice.id,
    title: practice.title.trim(),
    authorName: author.name,
    authorSlug: author.slug,
    productSlug: practice.slug,
    formatLabel: getDisplayFormat(practice.format),
    metaLabel: formatProductMeta({
      format: practice.format,
      audioCount,
      totalDurationSeconds: audioSummary?.totalDurationSeconds ?? null,
      durationMinutesFallback: practice.duration_minutes,
    }),
    coverUrl: getProductCoverDisplayUrl(practice.cover_url, practice.updated_at),
    isProgram: tracks.length >= 2,
    stepLabel:
      tracks.length >= 2
        ? `Шаг ${initial.trackIndex + 1} из ${tracks.length}`
        : null,
    progressPercent,
    progressLabel: buildProgressLabel(
      normalizedTracks,
      progress,
      currentTrack.id,
      completed ? 0 : initial.positionSeconds,
      completed,
    ),
    status,
    lastActivityAt: lastUpdatedAt,
    lastActivityLabel: formatHistoryActivityLabel(lastUpdatedAt),
    canListen: access.canListen,
    actionLabel,
    actionHref,
  };
}

export async function getListeningHistoryPageData(
  supabase: SupabaseClient,
  userId: string,
  filterParam: string | null | undefined,
): Promise<HistoryPageViewModel> {
  const filter = parseHistoryFilter(filterParam);

  const { data: progressRows, error: progressError } = await supabase
    .from("practice_audio_progress")
    .select(
      "practice_id, audio_item_id, position_seconds, completed, updated_at",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (progressError) {
    console.error("history_progress_load_error", progressError.message);
    throw new Error("history_progress_load_failed");
  }

  const aggregated = aggregateProgressByPractice(
    (progressRows ?? []) as HistoryProgressRow[],
  );

  if (aggregated.length === 0) {
    return {
      filter,
      groups: [],
      totalCount: 0,
      filteredCount: 0,
    };
  }

  const practiceIds = aggregated.map((entry) => entry.practiceId);

  const [{ data: practices, error: practicesError }, tracksMap, audioSummaries] =
    await Promise.all([
      supabase
        .from("practices")
        .select(
          `
          id,
          author_id,
          title,
          slug,
          format,
          duration_minutes,
          cover_url,
          updated_at,
          is_free,
          status,
          is_catalog_listed,
          guest_access_enabled,
          authors (name, slug)
        `,
        )
        .in("id", practiceIds),
      loadPracticeTracksMap(supabase, practiceIds),
      loadPublishedAudioSummaries(supabase, practiceIds).catch(() => []),
    ]);

  if (practicesError) {
    console.error("history_practices_load_error", practicesError.message);
    throw new Error("history_practices_load_failed");
  }

  const practiceMap = new Map(
    ((practices ?? []) as PracticeRow[]).map((practice) => [
      practice.id,
      practice,
    ]),
  );

  const audioSummaryMap = groupAudioSummariesByPractice(audioSummaries);

  const items: HistoryItem[] = [];

  for (const entry of aggregated) {
    const practice = practiceMap.get(entry.practiceId);
    const tracks = tracksMap.get(entry.practiceId) ?? [];

    if (!practice) {
      continue;
    }

    const item = await buildHistoryItem(
      supabase,
      userId,
      practice,
      entry.rows,
      tracks,
      audioSummaryMap.get(entry.practiceId) ?? null,
    );

    if (item) {
      items.push(item);
    }
  }

  const totalCount = items.length;
  const filteredItems = filterHistoryItems(items, filter);
  const groups = groupHistoryItems(filteredItems);

  return {
    filter,
    groups,
    totalCount,
    filteredCount: filteredItems.length,
  };
}
