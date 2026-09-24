import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePublicationClass } from "@/lib/author-products/publication-class";
import { chooseCatalogPreviewAudioRow } from "@/lib/catalog/catalog-preview-audio-choice";
import { listCourseStorefrontPreviewAudioItemIds } from "@/lib/course-content/learner-assets";
import { fromAudioPreviewWindowColumns } from "@/lib/listen/preview-window";
import {
  resolveMusicListenSource,
  type MusicStreamCandidate,
} from "@/lib/listen/music-delivery";
import { resolvePlayableAudioItemRows } from "@/lib/listen/validated-active-music-delivery";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { PublicPracticeRow } from "@/lib/products/lookup";
import {
  resolveCappedMaxPreviewWindow,
  type CappedMaxPreviewWindow,
} from "@/lib/max/preview-window";
import type { MaxPlaybackTrack } from "@/lib/max/playback-types";

export type MaxPreviewAudioRow = {
  id: string;
  title?: string | null;
  position?: number | null;
  duration_seconds?: number | null;
  audio_path?: string | null;
  status?: string | null;
  is_preview?: boolean | null;
  preview_start_ms?: number | null;
  preview_end_ms?: number | null;
  cover_url?: string | null;
  active_music_delivery_asset_id?: string | null;
};

export type MaxStorefrontPreview =
  | {
      ok: true;
      track: MaxPlaybackTrack;
      previewDurationSeconds: number;
      window: CappedMaxPreviewWindow;
      audioItem: MaxPreviewAudioRow;
    }
  | { ok: false; reason: "preview_unavailable" | "storage_unavailable" };

export type MaxStorefrontPreviewDeps = {
  listAudioItems?: (practiceId: string) => Promise<MaxPreviewAudioRow[]>;
  filterPlayable?: (rows: MaxPreviewAudioRow[]) => Promise<MaxPreviewAudioRow[]>;
  listCoursePreviewIds?: (practiceId: string) => Promise<Set<string>>;
  loadActiveStream?: (
    audioItemId: string,
    activeAssetId: string | null | undefined,
  ) => Promise<MusicStreamCandidate | null>;
  loadLegacyAudioUrl?: (practiceId: string) => Promise<string | null>;
};

async function defaultListAudioItems(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<MaxPreviewAudioRow[]> {
  const { data, error } = await supabase
    .from("audio_items")
    .select(
      "id, title, position, duration_seconds, audio_path, status, is_preview, preview_start_ms, preview_end_ms, cover_url, active_music_delivery_asset_id",
    )
    .eq("practice_id", practiceId)
    .eq("status", "published")
    .order("position", { ascending: true });

  if (error) {
    throw new Error("preview_audio_lookup_failed");
  }

  return (data ?? []) as MaxPreviewAudioRow[];
}

async function defaultLoadActiveStream(
  audioItemId: string,
  activeAssetId: string | null | undefined,
): Promise<MusicStreamCandidate | null> {
  if (!activeAssetId) {
    return null;
  }

  const serviceRole = createServiceRoleClient();
  const { data, error } = await serviceRole
    .from("music_audio_assets")
    .select("id, audio_item_id, asset_role, lifecycle_state, storage_bucket, storage_path")
    .eq("id", activeAssetId)
    .maybeSingle();

  if (error || !data || data.audio_item_id !== audioItemId) {
    return null;
  }

  return {
    audioItemId: data.audio_item_id,
    assetRole: data.asset_role,
    lifecycleState: data.lifecycle_state,
    storageBucket: data.storage_bucket,
    storagePath: data.storage_path,
  };
}

function trackDurationMs(row: MaxPreviewAudioRow | null): number | null {
  if (
    typeof row?.duration_seconds === "number" &&
    Number.isFinite(row.duration_seconds) &&
    row.duration_seconds > 0
  ) {
    return Math.round(row.duration_seconds * 1000);
  }
  return null;
}

function toPreviewTrack(
  row: MaxPreviewAudioRow,
  durationSeconds: number,
): MaxPlaybackTrack {
  return {
    trackId: row.id,
    title: (row.title ?? "").trim() || "Предпрослушивание",
    position: typeof row.position === "number" ? row.position : 1,
    durationSeconds,
    coverUrl: row.cover_url ?? null,
  };
}

function toPreviewResult(
  row: MaxPreviewAudioRow,
): MaxStorefrontPreview {
  const resolved = resolveCappedMaxPreviewWindow(
    fromAudioPreviewWindowColumns(row),
    trackDurationMs(row),
  );
  if (resolved.durationMs <= 0) {
    return { ok: false, reason: "preview_unavailable" };
  }

  return {
    ok: true,
    track: toPreviewTrack(row, resolved.durationSeconds),
    previewDurationSeconds: resolved.durationSeconds,
    window: resolved,
    audioItem: row,
  };
}

export async function resolveMaxStorefrontPreview(
  practice: PublicPracticeRow,
  supabase: SupabaseClient,
  deps: MaxStorefrontPreviewDeps = {},
): Promise<MaxStorefrontPreview> {
  try {
    const isCourse =
      resolvePublicationClass(practice.publication_class, practice.product_kind) ===
      "course";
    const listAudio =
      deps.listAudioItems ??
      ((practiceId: string) => defaultListAudioItems(supabase, practiceId));
    const rows = await listAudio(practice.id);
    const playable =
      deps.filterPlayable != null
        ? await deps.filterPlayable(rows)
        : await resolvePlayableAudioItemRows(rows, practice.product_kind, {
            serviceRole: supabase,
          });

    let allowedAudioItemIds: Set<string> | undefined;
    if (isCourse) {
      const listIds =
        deps.listCoursePreviewIds ??
        ((practiceId: string) =>
          listCourseStorefrontPreviewAudioItemIds({
            serviceRole: supabase,
            publicationId: practiceId,
          }));
      allowedAudioItemIds = await listIds(practice.id);
    }

    const chosenResult = chooseCatalogPreviewAudioRow(playable, {
      isCourse,
      allowedAudioItemIds,
    });
    if (!chosenResult.ok) {
      return { ok: false, reason: "preview_unavailable" };
    }

    let chosen = chosenResult.row;
    if (!chosen) {
      if (isCourse) {
        return { ok: false, reason: "preview_unavailable" };
      }

      const loadLegacy =
        deps.loadLegacyAudioUrl ??
        (async (practiceId: string) => {
          const { data, error } = await supabase
            .from("practices")
            .select("audio_url")
            .eq("id", practiceId)
            .maybeSingle();
          if (error) {
            throw new Error("preview_legacy_lookup_failed");
          }
          return typeof data?.audio_url === "string" ? data.audio_url.trim() : null;
        });
      const legacyPath = await loadLegacy(practice.id);
      if (!legacyPath) {
        return { ok: false, reason: "preview_unavailable" };
      }
      chosen = {
        id: `legacy-${practice.id}`,
        title: practice.title,
        position: 1,
        duration_seconds: null,
        audio_path: legacyPath,
        status: "published",
        is_preview: false,
        preview_start_ms: null,
        preview_end_ms: null,
        cover_url: practice.cover_url ?? null,
      };
    } else if (!chosen.audio_path?.trim() && practice.product_kind === "music") {
      const loadStream = deps.loadActiveStream ?? defaultLoadActiveStream;
      const stream = await loadStream(chosen.id, chosen.active_music_delivery_asset_id);
      const source = resolveMusicListenSource({
        productKind: practice.product_kind ?? "",
        audioItemId: chosen.id,
        audioPath: chosen.audio_path,
        activeStream: stream,
      });
      if (source.kind === "missing") {
        return { ok: false, reason: "preview_unavailable" };
      }
    }

    return toPreviewResult(chosen);
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
}

export async function resolveMaxPreviewStorageSource(input: {
  practice: PublicPracticeRow;
  audioItem: MaxPreviewAudioRow;
  loadActiveStream?: (
    audioItemId: string,
    activeAssetId: string | null | undefined,
  ) => Promise<MusicStreamCandidate | null>;
}): Promise<
  | { ok: true; bucket: string; path: string }
  | { ok: false; reason: "preview_unavailable" | "storage_unavailable" }
> {
  try {
    const audioPath = input.audioItem.audio_path?.trim() ?? "";
    if (audioPath) {
      return { ok: true, bucket: "practice-audio", path: audioPath };
    }

    const loadStream = input.loadActiveStream ?? defaultLoadActiveStream;
    const stream = await loadStream(
      input.audioItem.id,
      input.audioItem.active_music_delivery_asset_id,
    );
    const source = resolveMusicListenSource({
      productKind: input.practice.product_kind ?? "",
      audioItemId: input.audioItem.id,
      audioPath,
      activeStream: stream,
    });
    if (source.kind === "missing") {
      return { ok: false, reason: "preview_unavailable" };
    }
    return { ok: true, bucket: source.bucket, path: source.path };
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
}
