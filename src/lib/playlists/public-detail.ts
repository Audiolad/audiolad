import { cache } from "react";

import { getDisplayFormat } from "@/lib/author-products/format";
import { takeFirstPlaylistItemCoverUrls } from "@/lib/playlists/cover-presentation";
import { createPlaylistCoverSignedUrl } from "@/lib/playlists/covers";
import { isPracticeEligibleForPublicPlaylist } from "@/lib/playlists/public-content";
import { EDITORIAL_PLAYLIST_LABEL } from "@/lib/playlists/editorial-content";
import { USER_PLAYLIST_OWNER_LABEL } from "@/lib/playlists/listing-labels";
import { isPlatformOwnedPlaylist } from "@/lib/playlists/public-seo";
import {
  isValidPlaylistPublicSlug,
  normalizePlaylistPublicSlug,
} from "@/lib/playlists/public-slug";
import type { PlaylistVisibility } from "@/lib/playlists/types";
import { getProductCoverDisplayUrl, type ProductCoverFields } from "@/lib/products/cover-display";
import { formatProductDuration } from "@/lib/products/duration";
import {
  buildListenPath,
  buildPracticePublicPath,
} from "@/lib/products/paths";
import { playlistItemAudioMap, resolvePlaylistItemPresentation } from "@/lib/playlists/playlist-item-audio";
import {
  groupAudioSummariesByPractice,
  loadPublishedAudioItemsByIds,
  loadPublishedAudioSummaries,
  type PublishedAudioItemDetail,
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
  cover_image?: unknown;
  updated_at: string | null;
  status: string | null;
  is_catalog_listed: boolean | null;
  catalog_visibility?: string | null;
  authors: AuthorEmbed | AuthorEmbed[] | null;
};

type ItemRow = {
  id?: string;
  practice_id: string;
  audio_item_id?: string | null;
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
  owner_type?: string | null;
  description?: string | null;
};

export type PublicPlaylistItemView = ProductCoverFields & {
  practiceId: string;
  audioItemId: string | null;
  position: number;
  title: string;
  authorName: string | null;
  authorSlug: string | null;
  formatLabel: string | null;
  metaLabel: string | null;
  durationLabel: string | null;
  durationSeconds: number | null;
  productSlug: string | null;
  productHref: string | null;
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
    isPlatformOwned: boolean;
    description: string | null;
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
      is_editorial,
      owner_type,
      description
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
      id,
      practice_id,
      audio_item_id,
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
        cover_image,
        updated_at,
        status,
        is_catalog_listed,
        catalog_visibility,
        authors!practices_author_id_fkey (
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
    const audioItemIds: string[] = [];

    for (const row of rows) {
      const practice = normalizeOne(row.practices);
      if (practice?.id) {
        practiceIdsForAudio.push(practice.id);
      }
      if (typeof row.audio_item_id === "string") {
        audioItemIds.push(row.audio_item_id);
      }
    }

    let audioByPractice = new Map<
      string,
      { audioCount: number; totalDurationSeconds: number }
    >();
    let audioById = new Map<string, PublishedAudioItemDetail>();

    try {
      const [summaries, audioItems] = await Promise.all([
        loadPublishedAudioSummaries(supabase, practiceIdsForAudio),
        loadPublishedAudioItemsByIds(supabase, audioItemIds),
      ]);
      audioByPractice = groupAudioSummariesByPractice(summaries);
      audioById = playlistItemAudioMap(audioItems);
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

    for (const row of rows) {
      const practice = normalizeOne(row.practices);

      // Public playlist_items RLS permits only listed products. A missing
      // embed means its product is not public to this viewer, so omit it
      // completely: neither a placeholder nor practice_id may leak a slot.
      if (!practice || practice.catalog_visibility === "selected_users") {
        continue;
      }

      const eligible = isPracticeEligibleForPublicPlaylist({
        id: practice.id,
        status: practice.status,
        is_catalog_listed: practice.is_catalog_listed,
        is_free: practice.is_free,
        price: practice.price,
        cover_image: practice.cover_image,
      });

      const author = normalizeOne(practice.authors);
      const authorName = author?.name?.trim() || null;
      const authorSlug = author?.slug?.trim() || null;
      const audioSummary = audioByPractice.get(practice.id);
      const audioItem =
        typeof row.audio_item_id === "string"
          ? audioById.get(row.audio_item_id) ?? null
          : null;
      const presentation = resolvePlaylistItemPresentation({
        practice,
        audioItem,
        audioCount: audioSummary?.audioCount ?? 0,
        totalDurationSeconds: audioSummary?.totalDurationSeconds ?? null,
      });
      const durationSeconds = presentation.durationSeconds;
      const audioCount = audioItem ? 1 : audioSummary?.audioCount ?? 0;
      const coverFields = presentation.cover;

      if (eligible) {
        if (durationSeconds && durationSeconds > 0) {
          totalDurationSeconds += durationSeconds;
          hasAnyDuration = true;
        }
      } else {
        hasUnavailable = true;
      }

      // Audio readiness from published audio_items summaries only.
      const audioReady = row.audio_item_id
        ? Boolean(audioItem)
        : audioCount > 0;
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

      const resolvedDurationSeconds =
        durationSeconds && durationSeconds > 0
          ? durationSeconds
          : typeof practice.duration_minutes === "number" &&
              practice.duration_minutes > 0
            ? Math.round(practice.duration_minutes * 60)
            : null;
      const productSlug = practice.slug?.trim() || null;
      const productHref =
        authorSlug && productSlug
          ? buildPracticePublicPath(authorSlug, productSlug)
          : null;

      items.push({
        practiceId: practice.id,
        audioItemId: row.audio_item_id ?? null,
        position: row.position,
        title: presentation.title,
        authorName,
        authorSlug,
        formatLabel: getDisplayFormat(practice.format),
        metaLabel: eligible ? presentation.metaLabel : null,
        durationLabel: eligible ? presentation.durationLabel : null,
        durationSeconds: eligible ? resolvedDurationSeconds : null,
        productSlug,
        productHref,
        ...(eligible || practice.status === "published"
          ? coverFields
          : {
              coverUrl: null,
              coverImage: null,
              updatedAt: null,
            }),
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
            userId: playlist.user_id ?? undefined,
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
          isPlatformOwned: isPlatformOwnedPlaylist({
            ownerType: playlist.owner_type,
            isEditorial: playlist.is_editorial,
          }),
          description: playlist.description?.trim() || null,
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
        mosaicCoverUrls: takeFirstPlaylistItemCoverUrls(
          items.map((item) =>
            getProductCoverDisplayUrl(
              item.coverUrl,
              item.updatedAt,
              item.coverImage,
            ),
          ),
        ),
        ownerLabel: playlist.is_editorial
          ? EDITORIAL_PLAYLIST_LABEL
          : USER_PLAYLIST_OWNER_LABEL,
      },
    };
  },
);
