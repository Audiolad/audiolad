import type { SupabaseClient } from "@supabase/supabase-js";

import { isPlatformAdmin } from "@/lib/auth/platform-admin";

type PlaylistAccessRow = {
  id: string;
  user_id: string;
  is_editorial: boolean | null;
  visibility: string;
};

export async function loadPlaylistForAccessCheck(
  supabase: SupabaseClient,
  playlistId: string,
): Promise<{ playlist: PlaylistAccessRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("playlists")
    .select("id, user_id, is_editorial, visibility")
    .eq("id", playlistId)
    .maybeSingle();

  if (error) {
    return { playlist: null, error: error.message };
  }

  if (!data) {
    return { playlist: null, error: null };
  }

  return {
    playlist: data as PlaylistAccessRow,
    error: null,
  };
}

export async function canUserEditPlaylist(
  supabase: SupabaseClient,
  userId: string,
  playlist: PlaylistAccessRow,
): Promise<boolean> {
  if (playlist.user_id === userId) {
    return true;
  }

  if (playlist.is_editorial === true) {
    return isPlatformAdmin(supabase, userId);
  }

  return false;
}

export async function canUserEditEditorialPlaylist(
  supabase: SupabaseClient,
  userId: string,
  playlist: PlaylistAccessRow,
): Promise<boolean> {
  if (playlist.is_editorial !== true || playlist.visibility !== "public") {
    return false;
  }

  return canUserEditPlaylist(supabase, userId, playlist);
}
