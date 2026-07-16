import { resolvePlaybackCoverUrl } from "@/lib/products/cover-display";

import type { ListenTrack } from "./types";

export type ListenTrackSourceRow = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  duration_seconds: number | null;
  cover_url?: string | null;
  updated_at?: string | null;
};

export type ListenTrackPracticeContext = {
  cover_url: string | null;
  updated_at: string | null;
  use_shared_cover?: boolean | null;
};

export function mapRowToListenTrack(
  item: ListenTrackSourceRow,
  practice: ListenTrackPracticeContext,
): ListenTrack {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    position: item.position,
    durationSeconds: item.duration_seconds,
    coverImageUrl: resolvePlaybackCoverUrl(
      {
        cover_url: practice.cover_url,
        updated_at: practice.updated_at,
        use_shared_cover: practice.use_shared_cover ?? true,
      },
      {
        cover_url: item.cover_url ?? null,
        updated_at: item.updated_at ?? null,
      },
    ),
  };
}

export function mapLegacyPracticeToListenTrack(
  practice: ListenTrackPracticeContext & {
    id: string;
    title: string;
    description: string | null;
    duration_minutes?: number | null;
  },
): ListenTrack {
  return {
    id: `legacy-${practice.id}`,
    title: practice.title,
    description: practice.description,
    position: 1,
    durationSeconds:
      typeof practice.duration_minutes === "number" &&
      practice.duration_minutes > 0
        ? Math.round(practice.duration_minutes * 60)
        : null,
    coverImageUrl: resolvePlaybackCoverUrl(
      {
        cover_url: practice.cover_url,
        updated_at: practice.updated_at,
        use_shared_cover: practice.use_shared_cover ?? true,
      },
      null,
    ),
  };
}
