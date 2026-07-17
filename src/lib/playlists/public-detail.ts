import { cache } from "react";

import { getDisplayFormat } from "@/lib/author-products/format";
import { createPlaylistCoverSignedUrl } from "@/lib/playlists/covers";
import { isPracticeEligibleForPublicPlaylist } from "@/lib/playlists/public-content";
import { EDITORIAL_PLAYLIST_LABEL } from "@/lib/playlists/editorial-content";
import {
  isValidPlaylistPublicSlug,
  normalizePlaylistPublicSlug,
} from "@/lib/playlists/public-slug";
import type { PlaylistVisibility } from "@/lib/playlists/types";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import {
  formatProductDuration,
  formatProductMeta,
} from "@/lib/products/duration";
import {
  getGiftProductServiceLineLabel,
} from "@/lib/products/product-service-label";
import {
  buildListenPath,
  buildPracticePublicPath,
} from "@/lib/products/paths";
import {
  groupAudioSummariesByPractice,
  loadPublishedAudioSummaries,
} from "@/lib/products/public-audio-items";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type AuthorEmbed = {
  name: string;
  slug: string;
};

type PracticeEmbed = {
  id: string;
  title: string;
  slug: string;
  format: string | null;
  duration_minutes: number | null;
  price: number | null;
  is_free: boolean | null;
  cover_url: string | null;
  updated_at: string | null;
  status: string | null;
  is_catalog_listed: boolean | null;
  authors: AuthorEmbed | AuthorEmbed[] | null;
};

type ItemRow = {
  practice_id: string;
  position: number;
  practices: PracticeEmbed | PracticeEmbed[] | null;
};

type PlaylistDbRow = {
  id: string;
  user_id: string;
  title: string;
  visibility: PlaylistVisibility;
  slug: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  cover_path: string | null;
  cover_updated_at: string | null;
  is_editorial: boolean | null;
};

export type PublicPlaylistItemView = {
  practiceId: string;
  position: number;
  title: string;
  authorName: string | null;
  authorSlug: string | null;
  formatLabel: string | null;
  serviceLineLabel: string | null;
  metaLabel: string | null;
  coverDisplayUrl: string | null;
  available: boolean;
  href: string | null;
};

export type PublicPlaylistView = {
  /** Safe public fields only — no user_id / cover_path / playlist id. */
  playlist: {
    title: string;
    slug: string;
    visibility: "public";
    published_at: string;
    updated_at: string;
    isEditorial: boolean;
  };
  items: PublicPlaylistItemView[];
  itemsCount: number;
  availableCount: number;
  totalDurationLabel: string | null;
  hasUnavailable: boolean;
  allUnavailable: boolean;
  coverUrl: string | null;
  mosaicCoverUrls: Array<string | null>;
  ownerLabel: string;
};

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

/**
 * Load a public published playlist by slug for /p/[slug].
 * Does not write entitlement, progress, or updated_at.
 * Uses session/anon Supabase client (RLS) + service role only for cover signing.
 * React cache() dedupes generateMetadata + page within one request (keyed by slug).
 */
export const loadPublicPlaylistBySlug = cache(
  async function loadPublicPlaylistBySlug(
    rawSlug: string,
  ): Promise<
    | { ok: true; detail: PublicPlaylistView }
    | { ok: false; reason: "not_found" | "error" }
  > {
    if (!isValidPlaylistPublicSlug(rawSlug)) {
      return { ok: false, reason: "not_found" };
    }

    const slug = normalizePlaylistPublicSlug(rawSlug);
    const supabase = await createClient();

    const { data: playlistRow, error: playlistError } = await supabase
      .from("playlists")
      .select(
        `
      id,
      user_id,
      title,
      visibility,
      slug,
      published_at,
      created_at,
      updated_at,
      cover_path,
      cover_updated_at,
      is_editorial
    `,
      )
      .eq("slug", slug)
      .eq("visibility", "public")
      .not("published_at", "is", null)
      .maybeSingle();

    if (playlistError) {
      console.error("public_playlist_load_error", playlistError.message);
      return { ok: false, reason: "error" };
    }

    if (!playlistRow) {
      return { ok: false, reason: "not_found" };
    }

    const playlist = playlistRow as PlaylistDbRow;

    if (
      playlist.visibility !== "public" ||
      !playlist.slug ||
      !playlist.published_at
    ) {
      return { ok: false, reason: "not_found" };
    }

    const { data: itemRows, error: itemsError } = await supabase
      .from("playlist_items")
      .select(
        `
      practice_id,
      position,
      practices (
        id,
        title,
        slug,
        format,
        duration_minutes,
        price,
        is_free,
        cover_url,
        updated_at,
        status,
        is_catalog_listed,
        authors (
          name,
          slug
        )
      )
    `,
      )
      .eq("playlist_id", playlist.id)
      .order("position", { ascending: true });

    if (itemsError) {
      console.error("public_playlist_items_error", itemsError.message);
      return { ok: false, reason: "error" };
    }

    const rows = (itemRows as ItemRow[] | null) ?? [];
    const practiceIdsForAudio: string[] = [];

    for (const row of rows) {
      const practice = normalizeOne(row.practices);
      if (practice?.id) {
        practiceIdsForAudio.push(practice.id);
      }
    }

    let audioByPractice = new Map<
      string,
      { audioCount: number; totalDurationSeconds: number }
    >();

    try {
      const summaries = await loadPublishedAudioSummaries(
        supabase,
        practiceIdsForAudio,
      );
      audioByPractice = groupAudioSummariesByPractice(summaries);
    } catch (error) {
      console.error(
        "public_playlist_audio_summaries_error",
        error instanceof Error ? error.message : error,
      );
    }

    const items: PublicPlaylistItemView[] = [];
    let availableCount = 0;
    let hasUnavailable = false;
    let totalDurationSeconds = 0;
    let hasAnyDuration = false;
    const mosaicFromAvailable: Array<string | null> = [];

    for (const row of rows) {
      const practice = normalizeOne(row.practices);

      if (!practice) {
        hasUnavailable = true;
        items.push({
          practiceId: row.practice_id,
          position: row.position,
          title: "Практика временно недоступна",
          authorName: null,
          authorSlug: null,
          formatLabel: null,
          serviceLineLabel: null,
          metaLabel: null,
          coverDisplayUrl: null,
          available: false,
          href: null,
        });
        continue;
      }

      const eligible = isPracticeEligibleForPublicPlaylist({
        id: practice.id,
        status: practice.status,
        is_catalog_listed: practice.is_catalog_listed,
        is_free: practice.is_free,
        price: practice.price,
      });

      const author = normalizeOne(practice.authors);
      const authorName = author?.name?.trim() || null;
      const authorSlug = author?.slug?.trim() || null;
      const audioSummary = audioByPractice.get(practice.id);
      const durationSeconds = audioSummary?.totalDurationSeconds ?? null;
      const audioCount = audioSummary?.audioCount ?? 0;
      const coverDisplayUrl = getProductCoverDisplayUrl(
        practice.cover_url,
        practice.updated_at,
      );

      if (eligible) {
        if (durationSeconds && durationSeconds > 0) {
          totalDurationSeconds += durationSeconds;
          hasAnyDuration = true;
        } else if (
          typeof practice.duration_minutes === "number" &&
          practice.duration_minutes > 0
        ) {
          totalDurationSeconds += Math.round(practice.duration_minutes * 60);
          hasAnyDuration = true;
        }

        if (mosaicFromAvailable.length < 4) {
          mosaicFromAvailable.push(coverDisplayUrl);
        }
      } else {
        hasUnavailable = true;
      }

      // Audio readiness from published audio_items summaries only.
      const audioReady = audioCount > 0;
      const canOpen =
        eligible && audioReady && Boolean(practice.slug) && Boolean(authorSlug);

      let href: string | null = null;

      if (canOpen && authorSlug) {
        href = buildListenPath(authorSlug, practice.slug, { autoplay: true });
      } else if (eligible && authorSlug && practice.slug) {
        href = buildPracticePublicPath(authorSlug, practice.slug);
      }

      if (href) {
        availableCount += 1;
      } else {
        hasUnavailable = true;
      }

      items.push({
        practiceId: practice.id,
        position: row.position,
        title: practice.title.trim() || "Без названия",
        authorName,
        authorSlug,
        formatLabel: getDisplayFormat(practice.format),
        serviceLineLabel: getGiftProductServiceLineLabel(
          practice.is_free,
          practice.price,
        ),
        metaLabel: eligible
          ? formatProductMeta({
              format: practice.format,
              audioCount,
              totalDurationSeconds: durationSeconds,
              durationMinutesFallback: practice.duration_minutes,
              isFree: practice.is_free,
              price: practice.price,
            })
          : null,
        coverDisplayUrl:
          eligible || practice.status === "published" ? coverDisplayUrl : null,
        available: Boolean(href),
        href,
      });
    }

    let coverUrl: string | null = null;

    if (playlist.cover_path) {
      try {
        const storage = createServiceRoleClient();
        coverUrl = await createPlaylistCoverSignedUrl(
          storage,
          playlist.cover_path,
          {
            userId: playlist.user_id,
            playlistId: playlist.id,
          },
        );
      } catch (error) {
        console.error(
          "public_playlist_cover_signed_url_error",
          error instanceof Error ? error.message : error,
        );
      }
    }

    return {
      ok: true,
      detail: {
        playlist: {
          title: playlist.title,
          slug: playlist.slug,
          visibility: "public",
          published_at: playlist.published_at,
          updated_at: playlist.updated_at,
          isEditorial: playlist.is_editorial === true,
        },
        items,
        itemsCount: items.length,
        availableCount,
        totalDurationLabel: hasAnyDuration
          ? formatProductDuration(totalDurationSeconds)
          : null,
        hasUnavailable,
        allUnavailable: items.length > 0 && availableCount === 0,
        coverUrl,
        mosaicCoverUrls: mosaicFromAvailable,
        ownerLabel: playlist.is_editorial
          ? EDITORIAL_PLAYLIST_LABEL
          : "Подборка пользователя АудиоЛада",
      },
    };
  },
);
