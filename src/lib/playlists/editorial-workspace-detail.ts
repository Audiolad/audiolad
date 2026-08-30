import type { SupabaseClient } from "@supabase/supabase-js";

import { getDisplayFormat } from "@/lib/author-products/format";
import {
  getProductKindLabel,
  isMusicProductKind,
  normalizeProductKind,
  type ProductKind,
} from "@/lib/author-products/product-kind";
import { takeFirstPlaylistItemCoverUrls } from "@/lib/playlists/cover-presentation";
import { createPlaylistCoverSignedUrl } from "@/lib/playlists/covers";
import { getEditorialDirectionById } from "@/lib/playlists/editorial-directions";
import { getEditorialDiversityHint } from "@/lib/playlists/editorial-diversity";
import {
  canUserEditEditorialPlaylist,
  canUserManageCollaborators,
  loadPlaylistForAccessCheck,
} from "@/lib/playlists/playlist-access";
import { getPlaylistTopicKeys } from "@/lib/playlists/playlist-topics";
import { listActiveTopics } from "@/lib/topics/queries";
import { loadProfileSummaries } from "@/lib/playlists/profile-summaries";
import { getOwnedPlaylistById } from "@/lib/playlists/queries";
import type { PlaylistRow } from "@/lib/playlists/types";
import {
  getProductCoverDisplayUrl,
  type ProductCoverFields,
} from "@/lib/products/cover-display";
import { playlistItemAudioMap, resolvePlaylistItemPresentation } from "@/lib/playlists/playlist-item-audio";
import { buildListenPath } from "@/lib/products/paths";
import {
  groupAudioSummariesByPractice,
  loadPublishedAudioItemsByIds,
  loadPublishedAudioSummaries,
  type PublishedAudioItemDetail,
} from "@/lib/products/public-audio-items";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type AuthorEmbed = {
  id: string;
  name: string;
  slug: string;
};

type PracticeEmbed = {
  id: string;
  author_id: string | null;
  title: string;
  slug: string;
  format: string | null;
  product_kind: string | null;
  duration_minutes: number | null;
  cover_url: string | null;
  cover_image?: unknown;
  updated_at: string | null;
  use_shared_cover?: boolean | null;
  audio_url: string | null;
  status: string | null;
  is_catalog_listed: boolean | null;
  authors: AuthorEmbed | AuthorEmbed[] | null;
};

type ItemRow = {
  practice_id: string;
  audio_item_id?: string | null;
  position: number;
  practices: PracticeEmbed | PracticeEmbed[] | null;
};

export type EditorialWorkspaceItemView = ProductCoverFields & {
  practiceId: string;
  audioItemId: string | null;
  position: number;
  title: string;
  authorId: string | null;
  authorName: string | null;
  authorSlug: string | null;
  productKind: ProductKind;
  productKindLabel: string;
  formatLabel: string | null;
  metaLabel: string | null;
  available: boolean;
  listenHref: string | null;
};

export type EditorialAuditEventView = {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
  details: Record<string, unknown>;
};

export type EditorialWorkspaceDetail = {
  playlist: PlaylistRow;
  items: EditorialWorkspaceItemView[];
  itemsCount: number;
  uniqueAuthorCount: number;
  diversityHint: { authorName: string; count: number } | null;
  coverUrl: string | null;
  mosaicCoverUrls: Array<string | null>;
  creatorName: string | null;
  canEdit: boolean;
  canManageCollaborators: boolean;
  slugLocked: boolean;
  directionName: string | null;
  topicKeys: string[];
  topicOptions: Array<{
    key: string;
    title: string;
    isActive: boolean;
  }>;
  auditEvents: EditorialAuditEventView[];
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

function hasAudioReady(audioUrl: string | null | undefined, audioCount: number): boolean {
  return (
    (typeof audioUrl === "string" && audioUrl.trim().length > 0) || audioCount > 0
  );
}

export async function loadEditorialWorkspaceDetail(
  supabase: SupabaseClient,
  userId: string,
  playlistId: string,
): Promise<
  | { ok: true; detail: EditorialWorkspaceDetail }
  | { ok: false; reason: "not_found" | "forbidden" | "error" }
> {
  const { playlist: accessRow, error: accessError } =
    await loadPlaylistForAccessCheck(supabase, playlistId);

  if (accessError) {
    console.error("editorial_workspace_detail_access_error", accessError);
    return { ok: false, reason: "error" };
  }

  if (!accessRow) {
    return { ok: false, reason: "not_found" };
  }

  const canEdit = await canUserEditEditorialPlaylist(supabase, userId, accessRow);

  if (!canEdit) {
    return { ok: false, reason: "forbidden" };
  }

  const { playlist, error: playlistError } = await getOwnedPlaylistById(
    supabase,
    playlistId,
  );

  if (playlistError) {
    console.error("editorial_workspace_detail_load_error", playlistError);
    return { ok: false, reason: "error" };
  }

  if (!playlist || playlist.owner_type !== "platform") {
    return { ok: false, reason: "not_found" };
  }

  const canManageCollaborators = await canUserManageCollaborators(
    supabase,
    userId,
    accessRow,
  );

  let directionName: string | null = null;

  if (playlist.direction_id) {
    const { direction, error: directionError } = await getEditorialDirectionById(
      supabase,
      playlist.direction_id,
    );

    if (directionError) {
      console.error(
        "editorial_workspace_detail_direction_error",
        directionError,
      );
    }

    directionName = direction?.name ?? null;
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from("playlist_items")
    .select(
      `
      practice_id,
      audio_item_id,
      position,
      practices (
        id,
        author_id,
        title,
        slug,
        format,
        product_kind,
        duration_minutes,
        cover_url,
        cover_image,
        updated_at,
        use_shared_cover,
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
    console.error("editorial_workspace_detail_items_error", itemsError.message);
    return { ok: false, reason: "error" };
  }

  const rows = (itemRows as ItemRow[] | null) ?? [];
  const practiceIds = rows.map((row) => row.practice_id);
  const audioItemIds = rows
    .map((row) => row.audio_item_id)
    .filter((id): id is string => typeof id === "string");
  let audioByPractice = new Map<
    string,
    { audioCount: number; totalDurationSeconds: number }
  >();
  let audioById = new Map<string, PublishedAudioItemDetail>();

  try {
    const [summaries, audioItems] = await Promise.all([
      loadPublishedAudioSummaries(supabase, practiceIds),
      loadPublishedAudioItemsByIds(supabase, audioItemIds),
    ]);
    audioByPractice = groupAudioSummariesByPractice(summaries);
    audioById = playlistItemAudioMap(audioItems);
  } catch (error) {
    console.error(
      "editorial_workspace_detail_audio_error",
      error instanceof Error ? error.message : error,
    );
  }

  const items: EditorialWorkspaceItemView[] = [];
  const authorIds = new Set<string>();

  for (const row of rows) {
    const practice = normalizeOne(row.practices);

    if (!practice) {
      items.push({
        practiceId: row.practice_id,
        audioItemId: row.audio_item_id ?? null,
        position: row.position,
        title: "Материал сейчас недоступен",
        authorId: null,
        authorName: null,
        authorSlug: null,
        productKind: "practice",
        productKindLabel: "Практика",
        formatLabel: null,
        metaLabel: null,
        coverUrl: null,
        coverImage: null,
        updatedAt: null,
        available: false,
        listenHref: null,
      });
      continue;
    }

    const author = normalizeOne(practice.authors);
    const authorId = author?.id ?? practice.author_id ?? null;
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
    const audioCount = audioItem ? 1 : audioSummary?.audioCount ?? 0;
    const productKind = normalizeProductKind(practice.product_kind);
    const audioReady = row.audio_item_id
      ? Boolean(audioItem)
      : hasAudioReady(practice.audio_url, audioCount);
    const listenHref =
      audioReady && practice.slug
        ? authorSlug
          ? buildListenPath(authorSlug, practice.slug, { autoplay: true })
          : `/listen/${practice.slug}`
        : null;

    if (authorId) {
      authorIds.add(authorId);
    }

    items.push({
      practiceId: practice.id,
      audioItemId: row.audio_item_id ?? null,
      position: row.position,
      title: presentation.title,
      authorId,
      authorName,
      authorSlug,
      productKind,
      productKindLabel: isMusicProductKind(productKind) ? "Музыка" : "Практика",
      formatLabel: getDisplayFormat(practice.format) ?? getProductKindLabel(productKind),
      metaLabel: presentation.metaLabel,
      ...presentation.cover,
      available: Boolean(listenHref),
      listenHref,
    });
  }

  const mosaicCoverUrls = takeFirstPlaylistItemCoverUrls(
    items.map((item) =>
      getProductCoverDisplayUrl(
        item.coverUrl,
        item.updatedAt,
        item.coverImage,
        168,
        "sm",
      ),
    ),
  );

  let coverUrl: string | null = null;

  if (playlist.cover_path) {
    try {
      const storage = createServiceRoleClient();
      coverUrl = await createPlaylistCoverSignedUrl(
        storage,
        playlist.cover_path,
        { playlistId },
      );
    } catch (error) {
      console.error(
        "editorial_workspace_detail_cover_error",
        error instanceof Error ? error.message : error,
      );
    }
  }

  let topicKeys: string[] = [];
  let topicOptions: EditorialWorkspaceDetail["topicOptions"] = [];

  try {
    topicOptions = (await listActiveTopics(supabase)).map((topic) => ({
      key: topic.key,
      title: topic.title,
      isActive: true,
    }));
  } catch (error) {
    console.error(
      "editorial_workspace_detail_topics_options_error",
      error instanceof Error ? error.message : error,
    );
  }

  try {
    const storage = createServiceRoleClient();
    topicKeys = await getPlaylistTopicKeys(storage, playlistId);
  } catch (error) {
    console.error(
      "editorial_workspace_detail_topics_error",
      error instanceof Error ? error.message : error,
    );
  }

  let creatorName: string | null = null;
  let auditEvents: EditorialAuditEventView[] = [];

  try {
    const service = createServiceRoleClient();
    const { data: auditRows, error: auditError } = await supabase
      .from("playlist_audit_log")
      .select("id, action, actor_user_id, details, created_at")
      .eq("playlist_id", playlistId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (auditError) {
      console.error("editorial_workspace_audit_error", auditError.message);
    }

    const actorIds = (auditRows ?? [])
      .map((row) => row.actor_user_id)
      .filter((id): id is string => typeof id === "string");

    const profileIds = [
      ...actorIds,
      ...(playlist.created_by ? [playlist.created_by] : []),
    ];
    const profiles = await loadProfileSummaries(service, profileIds);

    if (playlist.created_by) {
      creatorName = profiles.get(playlist.created_by)?.displayName ?? null;
    }

    auditEvents = (auditRows ?? []).map((row) => ({
      id: row.id as string,
      action: row.action as string,
      actorName: row.actor_user_id
        ? (profiles.get(row.actor_user_id as string)?.displayName ?? null)
        : null,
      createdAt: row.created_at as string,
      details:
        row.details && typeof row.details === "object" && !Array.isArray(row.details)
          ? (row.details as Record<string, unknown>)
          : {},
    }));
  } catch (error) {
    console.error(
      "editorial_workspace_detail_enrich_error",
      error instanceof Error ? error.message : error,
    );
  }

  return {
    ok: true,
    detail: {
      playlist,
      items,
      itemsCount: items.length,
      uniqueAuthorCount: authorIds.size,
      diversityHint: getEditorialDiversityHint(items),
      coverUrl,
      mosaicCoverUrls,
      creatorName,
      canEdit,
      canManageCollaborators,
      slugLocked: Boolean(playlist.first_published_at),
      directionName,
      topicKeys,
      topicOptions,
      auditEvents,
    },
  };
}

export function editorialAuditActionLabel(action: string): string {
  switch (action) {
    case "playlist_created":
      return "Плейлист создан";
    case "item_added":
      return "Добавлены материалы";
    case "item_removed":
      return "Удалён материал";
    case "item_replaced":
      return "Заменён материал";
    case "item_moved":
      return "Изменён порядок";
    case "metadata_updated":
      return "Обновлены данные";
    case "published":
      return "Опубликован";
    case "unpublished":
      return "Снят с публикации";
    case "collaborator_added":
      return "Добавлен администратор плейлиста";
    case "collaborator_removed":
      return "Отозван доступ";
    case "collaborator_role_changed":
      return "Изменена роль";
    default:
      return action;
  }
}
