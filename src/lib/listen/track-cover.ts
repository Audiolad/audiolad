import { resolvePlaybackCoverFields, resolvePlaybackCoverUrl } from "@/lib/products/cover-display";

import type { ListenTrack } from "./types";

export type ListenTrackSourceRow = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  duration_seconds: number | null;
  cover_url?: string | null;
  cover_image?: unknown;
  updated_at?: string | null;
};

export type ListenTrackPracticeContext = {
  cover_url: string | null;
  cover_image?: unknown;
  updated_at: string | null;
  use_shared_cover?: boolean | null;
};

export function mapRowToListenTrack(
  item: ListenTrackSourceRow,
  practice: ListenTrackPracticeContext,
): ListenTrack {
  const coverFields = resolvePlaybackCoverFields(
    {
      cover_url: practice.cover_url,
      cover_image: practice.cover_image,
      updated_at: practice.updated_at,
      use_shared_cover: practice.use_shared_cover ?? true,
    },
    {
      cover_url: item.cover_url ?? null,
      cover_image: item.cover_image,
      updated_at: item.updated_at ?? null,
    },
  );

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    position: item.position,
    durationSeconds: item.duration_seconds,
    coverImageUrl: resolvePlaybackCoverUrl(
      {
        cover_url: practice.cover_url,
        cover_image: practice.cover_image,
        updated_at: practice.updated_at,
        use_shared_cover: practice.use_shared_cover ?? true,
      },
      {
        cover_url: item.cover_url ?? null,
        cover_image: item.cover_image,
        updated_at: item.updated_at ?? null,
      },
      360,
    ),
    coverImage: coverFields.coverImage ?? null,
    updatedAt: coverFields.updatedAt ?? null,
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
        cover_image: practice.cover_image,
        updated_at: practice.updated_at,
        use_shared_cover: practice.use_shared_cover ?? true,
      },
      null,
      360,
    ),
    coverImage: practice.cover_image ?? null,
    updatedAt: practice.updated_at ?? null,
  };
}
