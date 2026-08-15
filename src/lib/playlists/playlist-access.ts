import type { SupabaseClient } from "@supabase/supabase-js";

import { hasPermission } from "@/lib/auth/platform-access";
import type { PlaylistOwnerType } from "@/lib/playlists/types";

export type PlaylistAccessRow = {
  id: string;
  user_id: string | null;
  is_editorial: boolean | null;
  visibility: string;
  owner_type: PlaylistOwnerType | null;
  published_at: string | null;
  slug: string | null;
  direction_id: string | null;
};

export async function loadPlaylistForAccessCheck(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<{ playlist: PlaylistAccessRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("playlists")
    .select(
      "id, user_id, is_editorial, visibility, owner_type, published_at, slug, direction_id",
    )
    .eq("id", playlistId)
    .maybeSingle();

  if (error) {
    return { playlist: null, error: error.message };
  }

  if (!data) {
    return { playlist: null, error: null };
  }

  const row = data as PlaylistAccessRow;

  return {
    playlist: {
      ...row,
      user_id: row.user_id ?? null,
      owner_type:
        row.owner_type === "platform" || row.is_editorial === true
          ? "platform"
          : "user",
      published_at: row.published_at ?? null,
      slug: row.slug ?? null,
      direction_id: row.direction_id ?? null,
    },
    error: null,
  };
}

export async function isPlaylistCollaborator(
  supabase: SupabaseClient,
  userId: string,
  playlistId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("playlist_collaborators")
    .select("user_id")
    .eq("playlist_id", playlistId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data);
}

export async function isDirectionEditor(
  supabase: SupabaseClient,
  userId: string,
  directionId: string | null | undefined,
): Promise<boolean> {
  if (!directionId) {
    return false;
  }

  const { data, error } = await supabase
    .from("editorial_direction_members")
    .select("user_id")
    .eq("direction_id", directionId)
    .eq("user_id", userId)
    .eq("role", "direction_editor")
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data);
}

export async function listDirectionEditorIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("editorial_direction_members")
    .select("direction_id")
    .eq("user_id", userId)
    .eq("role", "direction_editor");

  if (error) {
    console.error("direction_editor_membership_lookup_error", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => row.direction_id)
    .filter((id): id is string => typeof id === "string");
}

export async function isAnyDirectionEditor(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const ids = await listDirectionEditorIds(supabase, userId);
  return ids.length > 0;
}

export function isPlatformPlaylist(playlist: PlaylistAccessRow): boolean {
  return (
    playlist.owner_type === "platform" || playlist.is_editorial === true
  );
}

export async function canUserEditPlaylist(
  supabase: SupabaseClient,
  userId: string,
  playlist: PlaylistAccessRow,
): Promise<boolean> {
  if (playlist.owner_type !== "platform" && playlist.user_id === userId) {
    return true;
  }

  if (!isPlatformPlaylist(playlist)) {
    return false;
  }

  if (await hasPermission(supabase, userId, "playlists.manage")) {
    return true;
  }

  if (await isDirectionEditor(supabase, userId, playlist.direction_id)) {
    return true;
  }

  return isPlaylistCollaborator(supabase, userId, playlist.id);
}

export async function canUserDeletePlaylist(
  supabase: SupabaseClient,
  userId: string,
  playlist: PlaylistAccessRow,
): Promise<boolean> {
  if (playlist.owner_type !== "platform" && playlist.user_id === userId) {
    return true;
  }

  if (!isPlatformPlaylist(playlist)) {
    return false;
  }

  return hasPermission(supabase, userId, "playlists.manage");
}

export async function canUserManageCollaborators(
  supabase: SupabaseClient,
  userId: string,
  playlist: PlaylistAccessRow,
): Promise<boolean> {
  if (!isPlatformPlaylist(playlist)) {
    return false;
  }

  if (await hasPermission(supabase, userId, "playlists.manage")) {
    return true;
  }

  return isDirectionEditor(supabase, userId, playlist.direction_id);
}

export async function canUserCreateEditorialInDirection(
  supabase: SupabaseClient,
  userId: string,
  directionId: string,
): Promise<boolean> {
  if (await hasPermission(supabase, userId, "playlists.manage")) {
    return true;
  }

  return isDirectionEditor(supabase, userId, directionId);
}

export async function canUserEditEditorialPlaylist(
  supabase: SupabaseClient,
  userId: string,
  playlist: PlaylistAccessRow,
): Promise<boolean> {
  if (!isPlatformPlaylist(playlist)) {
    return false;
  }

  return canUserEditPlaylist(supabase, userId, playlist);
}

export async function logPlaylistAudit(
  supabase: SupabaseClient,
  playlistId: string,
  action: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase.rpc("log_playlist_audit", {
    p_playlist_id: playlistId,
    p_action: action,
    p_details: details,
  });

  if (error) {
    console.error("playlist_audit_log_error", action, error.message);
  }
}

export async function logEditorialDirectionAudit(
  supabase: SupabaseClient,
  directionId: string,
  action: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase.rpc("log_editorial_direction_audit", {
    p_direction_id: directionId,
    p_action: action,
    p_details: details,
  });

  if (error) {
    console.error("editorial_direction_audit_log_error", action, error.message);
  }
}
