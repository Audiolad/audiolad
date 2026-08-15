import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

import { hasPermission } from "@/lib/auth/platform-access";
import { listDirectionEditorIds } from "@/lib/playlists/playlist-access";

export type EditorialWorkspaceAccess = {
  userId: string;
  hasAccess: boolean;
  canManage: boolean;
  canCreate: boolean;
  canManageDirections: boolean;
  isCollaborator: boolean;
  isDirectionEditor: boolean;
  directionIds: string[];
};

async function hasAnyPlaylistCollaboratorRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("playlist_collaborators")
    .select("playlist_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("editorial_workspace_collaborator_lookup_error", error.message);
    return false;
  }

  return Boolean(data);
}

export async function loadEditorialWorkspaceAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<EditorialWorkspaceAccess> {
  if (!userId.trim()) {
    return {
      userId,
      hasAccess: false,
      canManage: false,
      canCreate: false,
      canManageDirections: false,
      isCollaborator: false,
      isDirectionEditor: false,
      directionIds: [],
    };
  }

  let canManage = false;

  try {
    canManage = await hasPermission(supabase, userId, "playlists.manage");
  } catch (error) {
    console.error(
      "editorial_workspace_manage_check_error",
      error instanceof Error ? error.message : error,
    );
  }

  const directionIds = await listDirectionEditorIds(supabase, userId);
  const isDirectionEditorMember = directionIds.length > 0;
  const canCreate = canManage || isDirectionEditorMember;
  const isCollaborator = canManage
    ? false
    : await hasAnyPlaylistCollaboratorRow(supabase, userId);

  return {
    userId,
    hasAccess: canManage || isDirectionEditorMember || isCollaborator,
    canManage,
    canCreate,
    canManageDirections: canManage,
    isCollaborator,
    isDirectionEditor: isDirectionEditorMember,
    directionIds,
  };
}

/** Request-scoped cache for RSC (layout + shell + pages). */
export const getEditorialWorkspaceAccess = cache(loadEditorialWorkspaceAccess);

export function formatEditorialUpdatedAt(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatEditorialDateTime(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
