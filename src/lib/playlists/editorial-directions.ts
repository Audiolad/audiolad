import type { SupabaseClient } from "@supabase/supabase-js";

import { loadProfileSummaries } from "@/lib/playlists/profile-summaries";
import type {
  EditorialDirectionListItem,
  EditorialDirectionRow,
} from "@/lib/playlists/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type DirectionRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
};

export async function listVisibleEditorialDirections(
  supabase: SupabaseClient,
  options?: { ids?: string[] },
): Promise<{ directions: EditorialDirectionRow[]; error: string | null }> {
  let query = supabase
    .from("editorial_directions")
    .select("id, name, slug, created_at, updated_at")
    .order("name", { ascending: true });

  if (options?.ids) {
    if (options.ids.length === 0) {
      return { directions: [], error: null };
    }

    query = query.in("id", options.ids);
  }

  const { data, error } = await query;

  if (error) {
    return { directions: [], error: error.message };
  }

  return {
    directions: ((data as DirectionRow[] | null) ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
    error: null,
  };
}

export async function getEditorialDirectionById(
  supabase: SupabaseClient,
  directionId: string,
): Promise<{ direction: EditorialDirectionRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("editorial_directions")
    .select("id, name, slug, created_at, updated_at")
    .eq("id", directionId)
    .maybeSingle();

  if (error) {
    return { direction: null, error: error.message };
  }

  if (!data) {
    return { direction: null, error: null };
  }

  const row = data as DirectionRow;

  return {
    direction: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    error: null,
  };
}

export async function listEditorialDirectionsForManage(
  supabase: SupabaseClient,
): Promise<{ directions: EditorialDirectionListItem[]; error: string | null }> {
  const { directions, error } = await listVisibleEditorialDirections(supabase);

  if (error) {
    return { directions: [], error };
  }

  if (directions.length === 0) {
    return { directions: [], error: null };
  }

  const directionIds = directions.map((row) => row.id);

  const { data: playlistRows, error: playlistError } = await supabase
    .from("playlists")
    .select("id, direction_id")
    .eq("owner_type", "platform")
    .in("direction_id", directionIds);

  if (playlistError) {
    return { directions: [], error: playlistError.message };
  }

  const countByDirection = new Map<string, number>();

  for (const row of playlistRows ?? []) {
    if (typeof row.direction_id !== "string") {
      continue;
    }

    countByDirection.set(
      row.direction_id,
      (countByDirection.get(row.direction_id) ?? 0) + 1,
    );
  }

  const { data: memberRows, error: memberError } = await supabase
    .from("editorial_direction_members")
    .select("direction_id, user_id")
    .in("direction_id", directionIds)
    .eq("role", "direction_editor");

  if (memberError) {
    return { directions: [], error: memberError.message };
  }

  const editorIds = (memberRows ?? [])
    .map((row) => row.user_id)
    .filter((id): id is string => typeof id === "string");

  let profiles = new Map<string, { displayName: string; email: string | null }>();

  try {
    const service = createServiceRoleClient();
    profiles = await loadProfileSummaries(service, editorIds);
  } catch (profileError) {
    console.error(
      "editorial_directions_list_profiles_error",
      profileError instanceof Error ? profileError.message : profileError,
    );
  }

  const editorsByDirection = new Map<
    string,
    EditorialDirectionListItem["editors"]
  >();

  for (const row of memberRows ?? []) {
    if (typeof row.direction_id !== "string" || typeof row.user_id !== "string") {
      continue;
    }

    const profile = profiles.get(row.user_id);
    const editors = editorsByDirection.get(row.direction_id) ?? [];
    editors.push({
      userId: row.user_id,
      displayName: profile?.displayName ?? "Пользователь",
      email: profile?.email ?? null,
    });
    editorsByDirection.set(row.direction_id, editors);
  }

  return {
    directions: directions.map((row) => ({
      ...row,
      playlistCount: countByDirection.get(row.id) ?? 0,
      editors: editorsByDirection.get(row.id) ?? [],
    })),
    error: null,
  };
}

export async function directionSlugExists(
  supabase: SupabaseClient,
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  let query = supabase.from("editorial_directions").select("id").eq("slug", slug);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error("direction_slug_lookup_failed");
  }

  return Boolean(data?.id);
}
