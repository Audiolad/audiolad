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
};

export async function loadPlaylistForAccessCheck(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<{ playlist: PlaylistAccessRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("playlists")
    .select("id, user_id, is_editorial, visibility, owner_type, published_at, slug")
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

  return hasPermission(supabase, userId, "playlists.manage");
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
