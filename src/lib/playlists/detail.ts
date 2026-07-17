import type { SupabaseClient } from "@supabase/supabase-js";

import { getDisplayFormat } from "@/lib/author-products/format";
import {
  createPlaylistCoverSignedUrl,
} from "@/lib/playlists/covers";
import type { PlaylistRow, PlaylistVisibility } from "@/lib/playlists/types";
import {
  canEntitledUserAccessPracticeStatus,
  isPracticeCatalogListed,
  isPracticePublished,
  type ProductAccessInput,
} from "@/lib/products/access";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import {
  formatProductDuration,
  formatCatalogProductStats,
} from "@/lib/products/duration";
import { buildListenPath } from "@/lib/products/paths";
import {
  groupAudioSummariesByPractice,
  loadPublishedAudioSummaries,
} from "@/lib/products/public-audio-items";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  canUserEditEditorialPlaylist,
  canUserEditPlaylist,
  loadPlaylistForAccessCheck,
} from "@/lib/playlists/playlist-access";

type AuthorEmbed = {
  id: string;
  name: string;
  slug: string;
};

type PracticeEmbed = {
  id: string;
  author_id: string;
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
  authors: AuthorEmbed | AuthorEmbed[] | null;
};

type ItemRow = {
  practice_id: string;
  position: number;
  practices: PracticeEmbed | PracticeEmbed[] | null;
};

export type PlaylistDetailItemView = {
  practiceId: string;
  position: number;
  title: string;
  authorName: string | null;
  authorSlug: string | null;
  formatLabel: string | null;
  metaLabel: string | null;
  coverDisplayUrl: string | null;
  available: boolean;
  unavailableReason: string | null;
  listenHref: string | null;
};

export type PlaylistDetailView = {
  playlist: PlaylistRow;
  items: PlaylistDetailItemView[];
  itemsCount: number;
  totalDurationLabel: string | null;
  hasUnavailable: boolean;
  coverUrl: string | null;
  mosaicCoverUrls: Array<string | null>;
  canEdit: boolean;
  canManageEditorialPractices: boolean;
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

function hasAudioReady(audioUrl: string | null | undefined): boolean {
  return typeof audioUrl === "string" && audioUrl.trim().length > 0;
}

function isEntitlementActive(expiresAt: string | null): boolean {
  if (expiresAt === null) {
    return true;
  }

  const expiresDate = new Date(expiresAt);

  if (Number.isNaN(expiresDate.getTime())) {
    return false;
  }

  return expiresDate > new Date();
}

/**
 * Batch canListen check mirroring resolveProductAccess without N+1 queries.
 * Does not invent a parallel entitlement model.
 */
async function batchCanListen(
  supabase: SupabaseClient,
  userId: string,
  practices: ProductAccessInput[],
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();

  if (practices.length === 0) {
    return result;
  }

  const practiceIds = practices.map((practice) => practice.id);
  const authorIds = Array.from(
    new Set(practices.map((practice) => practice.author_id).filter(Boolean)),
  );

  const authorMemberSet = new Set<string>();

  if (authorIds.length > 0) {
    const { data: memberships, error: membershipError } = await supabase
      .from("author_members")
      .select("author_id")
      .eq("user_id", userId)
      .in("author_id", authorIds);

    if (membershipError) {
      throw new Error("author_membership_lookup_failed");
    }

    for (const row of memberships ?? []) {
      if (typeof row.author_id === "string") {
        authorMemberSet.add(row.author_id);
      }
    }
  }

  const entitledSet = new Set<string>();

  const { data: entitlements, error: entitlementError } = await supabase
    .from("user_practices")
    .select("practice_id, expires_at")
    .eq("user_id", userId)
    .in("practice_id", practiceIds);

  if (entitlementError) {
    throw new Error("entitlement_lookup_failed");
  }

  for (const row of entitlements ?? []) {
    if (
      typeof row.practice_id === "string" &&
      isEntitlementActive((row.expires_at as string | null) ?? null)
    ) {
      entitledSet.add(row.practice_id);
    }
  }

  for (const practice of practices) {
    if (authorMemberSet.has(practice.author_id)) {
      result.set(practice.id, true);
      continue;
    }

    if (
      entitledSet.has(practice.id) &&
      canEntitledUserAccessPracticeStatus(practice.status)
    ) {
      result.set(practice.id, true);
      continue;
    }

    if (
      practice.is_free === true &&
      isPracticePublished(practice.status) &&
      isPracticeCatalogListed(practice)
    ) {
      result.set(practice.id, true);
      continue;
    }

    result.set(practice.id, false);
  }

  return result;
}

export async function loadOwnedPlaylistDetail(
  supabase: SupabaseClient,
  userId: string,
  playlistId: string,
): Promise<
  | { ok: true; detail: PlaylistDetailView }
  | { ok: false; reason: "not_found" | "forbidden" | "error" }
> {
  const { playlist: accessRow, error: accessError } =
    await loadPlaylistForAccessCheck(supabase, playlistId);

  if (accessError) {
    console.error("playlist_detail_access_error", accessError);
    return { ok: false, reason: "error" };
  }

  if (!accessRow) {
    return { ok: false, reason: "not_found" };
  }

  const canEdit = await canUserEditPlaylist(supabase, userId, accessRow);

  if (!canEdit) {
    return { ok: false, reason: "forbidden" };
  }

  const canManageEditorialPractices = await canUserEditEditorialPlaylist(
    supabase,
    userId,
    accessRow,
  );

  const { data: playlistRow, error: playlistError } = await supabase
    .from("playlists")
    .select(
      "id, title, visibility, slug, published_at, created_at, updated_at, user_id, cover_path, cover_updated_at, is_editorial",
    )
    .eq("id", playlistId)
    .maybeSingle();

  if (playlistError) {
    console.error("playlist_detail_load_error", playlistError.message);
    return { ok: false, reason: "error" };
  }

  if (!playlistRow) {
    return { ok: false, reason: "not_found" };
  }

  const playlist: PlaylistRow = {
    id: playlistRow.id as string,
    title: playlistRow.title as string,
    visibility: playlistRow.visibility as PlaylistVisibility,
    slug: (playlistRow.slug as string | null) ?? null,
    published_at: (playlistRow.published_at as string | null) ?? null,
    created_at: playlistRow.created_at as string,
    updated_at: playlistRow.updated_at as string,
    cover_path: (playlistRow.cover_path as string | null) ?? null,
    cover_updated_at: (playlistRow.cover_updated_at as string | null) ?? null,
    is_editorial: playlistRow.is_editorial === true,
  };

  const { data: itemRows, error: itemsError } = await supabase
    .from("playlist_items")
    .select(
      `
      practice_id,
      position,
      practices (
        id,
        author_id,
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
        authors!practices_author_id_fkey (
          id,
          name,
          slug
        )
      )
    `,
    )
    .eq("playlist_id", playlistId)
    .order("position", { ascending: true });

  if (itemsError) {
    console.error("playlist_detail_items_error", itemsError.message);
    return { ok: false, reason: "error" };
  }

  const rows = (itemRows as ItemRow[] | null) ?? [];
  const practicesForAccess: ProductAccessInput[] = [];
  const practiceIds: string[] = [];

  for (const row of rows) {
    const practice = normalizeOne(row.practices);

    if (practice) {
      practiceIds.push(practice.id);
      practicesForAccess.push({
        id: practice.id,
        author_id: practice.author_id,
        is_free: practice.is_free,
        status: practice.status,
        is_catalog_listed: practice.is_catalog_listed,
      });
    }
  }

  let canListenById = new Map<string, boolean>();
  let audioByPractice = new Map<
    string,
    { audioCount: number; totalDurationSeconds: number }
  >();

  try {
    canListenById = await batchCanListen(supabase, userId, practicesForAccess);
  } catch (error) {
    console.error(
      "playlist_detail_access_batch_error",
      error instanceof Error ? error.message : error,
    );
    return { ok: false, reason: "error" };
  }

  try {
    const summaries = await loadPublishedAudioSummaries(supabase, practiceIds);
    audioByPractice = groupAudioSummariesByPractice(summaries);
  } catch (error) {
    console.error(
      "playlist_detail_audio_summaries_error",
      error instanceof Error ? error.message : error,
    );
  }

  const items: PlaylistDetailItemView[] = [];
  let hasUnavailable = false;
  let totalDurationSeconds = 0;
  let hasAnyDuration = false;

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
        metaLabel: null,
        coverDisplayUrl: null,
        available: false,
        unavailableReason: "Материал сейчас недоступен",
        listenHref: null,
      });
      continue;
    }

    const author = normalizeOne(practice.authors);
    const authorName = author?.name?.trim() || null;
    const authorSlug = author?.slug?.trim() || null;
    const audioSummary = audioByPractice.get(practice.id);
    const durationSeconds = audioSummary?.totalDurationSeconds ?? null;
    const audioCount = audioSummary?.audioCount ?? 0;

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

    const canListen = canListenById.get(practice.id) === true;
    const audioReady = hasAudioReady(practice.audio_url) || audioCount > 0;
    const canOpen = canListen && audioReady && Boolean(practice.slug);
    const listenHref =
      canOpen && authorSlug
        ? buildListenPath(authorSlug, practice.slug, { autoplay: true })
        : canOpen
          ? `/listen/${practice.slug}`
          : null;

    if (!listenHref) {
      hasUnavailable = true;
    }

    items.push({
      practiceId: practice.id,
      position: row.position,
      title: practice.title.trim() || "Без названия",
      authorName,
      authorSlug,
      formatLabel: getDisplayFormat(practice.format),
      metaLabel: formatCatalogProductStats({
        audioCount,
        totalDurationSeconds: durationSeconds,
        durationMinutesFallback: practice.duration_minutes,
      }),
      coverDisplayUrl: getProductCoverDisplayUrl(
        practice.cover_url,
        practice.updated_at,
      ),
      available: Boolean(listenHref),
      unavailableReason: listenHref ? null : "Материал сейчас недоступен",
      listenHref,
    });
  }

  const mosaicCoverUrls = items
    .slice(0, 4)
    .map((item) => item.coverDisplayUrl);

  let coverUrl: string | null = null;

  if (playlist.cover_path) {
    try {
      const storage = createServiceRoleClient();
      coverUrl = await createPlaylistCoverSignedUrl(
        storage,
        playlist.cover_path,
        { userId, playlistId },
      );
    } catch (error) {
      console.error(
        "playlist_detail_cover_signed_url_error",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return {
    ok: true,
    detail: {
      playlist,
      items,
      itemsCount: items.length,
      totalDurationLabel: hasAnyDuration
        ? formatProductDuration(totalDurationSeconds)
        : null,
      hasUnavailable,
      coverUrl,
      mosaicCoverUrls,
      canEdit,
      canManageEditorialPractices,
    },
  };
}
