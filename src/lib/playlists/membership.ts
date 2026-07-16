import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resolveProductAccess,
  type ProductAccessInput,
} from "@/lib/products/access";
import { isPracticeEligibleForPublicPlaylist } from "@/lib/playlists/public-content";
import type {
  PlaylistMembershipItem,
  PlaylistMembershipReason,
  PlaylistVisibility,
} from "@/lib/playlists/types";

type MembershipPlaylistRow = {
  id: string;
  title: string;
  visibility: PlaylistVisibility;
  updated_at: string;
  playlist_items?: { count: number }[] | null;
};

type PracticeMembershipFields = ProductAccessInput & {
  price: number | null;
};

export type MembershipRpcResult = {
  practice_id: string;
  playlist_ids: string[];
  added: number;
  removed: number;
  changed: boolean;
  touched_playlist_ids: string[];
};

export function isMembershipRpcResult(
  value: unknown,
): value is MembershipRpcResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as MembershipRpcResult;

  return (
    typeof row.practice_id === "string" &&
    Array.isArray(row.playlist_ids) &&
    typeof row.added === "number" &&
    typeof row.removed === "number" &&
    typeof row.changed === "boolean" &&
    Array.isArray(row.touched_playlist_ids)
  );
}

export function mapMembershipRpcError(message: string): {
  status: number;
  error: string;
  message?: string;
  playlistId?: string;
} {
  const normalized = message.toLowerCase();

  if (normalized.includes("not_authenticated")) {
    return { status: 401, error: "unauthorized" };
  }

  if (
    normalized.includes("practice_id_required") ||
    normalized.includes("playlist_ids_required") ||
    normalized.includes("playlist_ids_limit") ||
    normalized.includes("duplicate_playlist_ids") ||
    normalized.includes("invalid input")
  ) {
    return { status: 400, error: "invalid_request" };
  }

  if (
    normalized.includes("practice_not_found") ||
    normalized.includes("playlist_not_found")
  ) {
    return { status: 404, error: "not_found" };
  }

  if (normalized.includes("public_content_invalid")) {
    return {
      status: 409,
      error: "public_content_invalid",
      message:
        "В публичный плейлист можно добавлять только бесплатные материалы, доступные всем.",
    };
  }

  if (normalized.includes("entitlement_required")) {
    return {
      status: 403,
      error: "entitlement_required",
      message: "Недостаточно доступа, чтобы добавить материал в плейлист.",
    };
  }

  if (normalized.includes("items_limit_reached")) {
    const playlistIdMatch = message.match(
      /playlist_id=([0-9a-f-]{36})/i,
    );
    return {
      status: 409,
      error: "limit_reached",
      message: "В плейлисте может быть не больше 100 материалов.",
      playlistId: playlistIdMatch?.[1],
    };
  }

  return { status: 500, error: "internal_error" };
}

function visibilityReason(
  visibility: PlaylistVisibility,
  canAdd: boolean,
): PlaylistMembershipReason {
  if (canAdd) {
    return "ok";
  }

  if (visibility === "public") {
    return "public_requires_free";
  }

  return "entitlement_required";
}

export async function listPlaylistMembershipForPractice(
  supabase: SupabaseClient,
  userId: string,
  practiceId: string,
): Promise<{
  playlists: PlaylistMembershipItem[];
  error: string | null;
}> {
  const { data: practiceRow, error: practiceError } = await supabase
    .from("practices")
    .select("id, author_id, status, is_free, price, is_catalog_listed")
    .eq("id", practiceId)
    .maybeSingle();

  if (practiceError) {
    return { playlists: [], error: practiceError.message };
  }

  if (!practiceRow) {
    return { playlists: [], error: "practice_not_found" };
  }

  const practice = practiceRow as PracticeMembershipFields;
  const access = await resolveProductAccess(supabase, practice, userId);
  const canPrivate = access.canListen;
  const canPublic = isPracticeEligibleForPublicPlaylist(practice);

  const { data, error } = await supabase
    .from("playlists")
    .select(
      `
      id,
      title,
      visibility,
      updated_at,
      is_editorial,
      playlist_items(count)
    `,
    )
    .eq("user_id", userId)
    .eq("is_editorial", false)
    .order("updated_at", { ascending: false });
  if (error) {
    return { playlists: [], error: error.message };
  }

  const playlistRows = (data as MembershipPlaylistRow[] | null) ?? [];
  const playlistIds = playlistRows.map((row) => row.id);

  const containsSet = new Set<string>();

  if (playlistIds.length > 0) {
    const { data: itemRows, error: itemsError } = await supabase
      .from("playlist_items")
      .select("playlist_id")
      .eq("practice_id", practiceId)
      .in("playlist_id", playlistIds);

    if (itemsError) {
      return { playlists: [], error: itemsError.message };
    }

    for (const row of itemRows ?? []) {
      if (typeof row.playlist_id === "string") {
        containsSet.add(row.playlist_id);
      }
    }
  }

  const playlists: PlaylistMembershipItem[] = playlistRows.map((row) => {
    const contains = containsSet.has(row.id);
    const canAdd =
      row.visibility === "public" ? canPublic : canPrivate;
    const reason = visibilityReason(row.visibility, canAdd);

    return {
      id: row.id,
      title: row.title,
      visibility: row.visibility,
      contains,
      itemsCount: row.playlist_items?.[0]?.count ?? 0,
      canAdd,
      reason,
    };
  });

  return { playlists, error: null };
}
