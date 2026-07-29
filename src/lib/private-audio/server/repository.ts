import type { SupabaseClient } from "@supabase/supabase-js";

import { PRIVATE_AUDIO_LIMITS } from "@/lib/private-audio/limits";
import {
  toDetailDto,
  toListItemDto,
  toProgressDto,
} from "@/lib/private-audio/mappers";
import {
  mapPrivateAudioRpcError,
  PrivateAudioApiError,
} from "@/lib/private-audio/server/errors";
import { createSignedCoverUrl } from "@/lib/private-audio/server/signed-urls";
import type {
  PrivateAudioDetailDto,
  PrivateAudioItemRow,
  PrivateAudioListItemDto,
  PrivateAudioProgressDto,
  PrivateAudioProgressInput,
  PrivateAudioQuotaUsage,
} from "@/lib/private-audio/types";
import { isProgressNearComplete } from "@/lib/private-audio/validation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const ITEM_SELECT =
  "id, owner_user_id, source_type, title, author_text, audio_path, audio_mime_type, audio_size_bytes, duration_seconds, original_filename, cover_path, rights_accepted_at, created_at, updated_at";

function throwMappedRpc(error: { message: string }): never {
  const mapped = mapPrivateAudioRpcError(error.message);
  throw new PrivateAudioApiError(mapped.code, mapped.status);
}

export async function getOwnedPrivateAudioItem(
  ownerUserId: string,
  itemId: string,
): Promise<PrivateAudioItemRow> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("private_audio_items")
    .select(ITEM_SELECT)
    .eq("id", itemId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (error) {
    console.error("private_audio_get_error", error.message);
    throw new PrivateAudioApiError("internal_error", 500);
  }

  if (!data) {
    throw new PrivateAudioApiError("not_found", 404);
  }

  return data as PrivateAudioItemRow;
}

export async function getPrivateAudioQuotaUsage(
  ownerUserId: string,
): Promise<PrivateAudioQuotaUsage> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("private_audio_items")
    .select("audio_size_bytes")
    .eq("owner_user_id", ownerUserId);

  if (error) {
    console.error("private_audio_quota_error", error.message);
    throw new PrivateAudioApiError("internal_error", 500);
  }

  const rows = data ?? [];
  const totalBytes = rows.reduce(
    (sum, row) => sum + Number(row.audio_size_bytes ?? 0),
    0,
  );

  return {
    itemCount: rows.length,
    totalBytes,
    maxItems: PRIVATE_AUDIO_LIMITS.maxItemsPerUser,
    maxTotalBytes: PRIVATE_AUDIO_LIMITS.maxTotalBytesPerUser,
  };
}

export async function listPrivateAudioItems(
  supabase: SupabaseClient,
  ownerUserId: string,
): Promise<PrivateAudioListItemDto[]> {
  const { data, error } = await supabase
    .from("private_audio_items")
    .select(ITEM_SELECT)
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("private_audio_list_error", error.message);
    throw new PrivateAudioApiError("internal_error", 500);
  }

  const rows = (data ?? []) as PrivateAudioItemRow[];

  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => row.id);
  const { data: progressRows, error: progressError } = await supabase
    .from("private_audio_item_progress")
    .select("private_audio_item_id, position_seconds, completed, updated_at")
    .eq("user_id", ownerUserId)
    .in("private_audio_item_id", ids);

  if (progressError) {
    console.error("private_audio_list_progress_error", progressError.message);
    throw new PrivateAudioApiError("internal_error", 500);
  }

  const progressMap = new Map(
    (progressRows ?? []).map((row) => [
      row.private_audio_item_id as string,
      toProgressDto({
        positionSeconds: row.position_seconds as number,
        completed: row.completed as boolean,
        updatedAt: row.updated_at as string,
      }),
    ]),
  );

  const items: PrivateAudioListItemDto[] = [];

  for (const row of rows) {
    const coverUrl = row.cover_path
      ? await createSignedCoverUrl(row.cover_path)
      : null;

    items.push(
      toListItemDto(
        row,
        progressMap.get(row.id) ??
          toProgressDto({ durationSeconds: row.duration_seconds }),
        coverUrl,
      ),
    );
  }

  return items;
}

export async function getPrivateAudioDetail(
  supabase: SupabaseClient,
  ownerUserId: string,
  itemId: string,
): Promise<PrivateAudioDetailDto> {
  const row = await getOwnedPrivateAudioItem(ownerUserId, itemId);
  const progress = await getPrivateAudioProgress(
    supabase,
    itemId,
    row.duration_seconds,
  );
  const coverUrl = row.cover_path
    ? await createSignedCoverUrl(row.cover_path)
    : null;

  return toDetailDto(row, progress, coverUrl);
}

export async function getPrivateAudioProgress(
  supabase: SupabaseClient,
  itemId: string,
  durationSeconds: number | null = null,
): Promise<PrivateAudioProgressDto> {
  const { data, error } = await supabase.rpc("get_private_audio_item_progress", {
    p_item_id: itemId,
  });

  if (error) {
    throwMappedRpc(error);
  }

  const record = (data ?? {}) as Record<string, unknown>;

  return toProgressDto({
    positionSeconds:
      typeof record.position_seconds === "number" ? record.position_seconds : 0,
    durationSeconds,
    completed: record.completed === true,
    updatedAt: typeof record.updated_at === "string" ? record.updated_at : null,
  });
}

export async function savePrivateAudioProgress(
  supabase: SupabaseClient,
  itemId: string,
  input: PrivateAudioProgressInput,
): Promise<PrivateAudioProgressDto> {
  if (!Number.isFinite(input.positionSeconds) || input.positionSeconds < 0) {
    throw new PrivateAudioApiError("invalid_request", 400);
  }

  const completed =
    input.completed === true ||
    isProgressNearComplete(input.positionSeconds, input.durationSeconds);

  const { data, error } = await supabase.rpc(
    "upsert_private_audio_item_progress",
    {
      p_item_id: itemId,
      p_position_seconds: Math.floor(input.positionSeconds),
      p_completed: completed,
    },
  );

  if (error) {
    throwMappedRpc(error);
  }

  const record = (data ?? {}) as Record<string, unknown>;

  return toProgressDto({
    positionSeconds:
      typeof record.position_seconds === "number"
        ? record.position_seconds
        : Math.floor(input.positionSeconds),
    durationSeconds: input.durationSeconds ?? null,
    completed: record.completed === true || completed,
    updatedAt:
      typeof record.updated_at === "string"
        ? record.updated_at
        : new Date().toISOString(),
  });
}

export async function updatePrivateAudioMetadata(input: {
  ownerUserId: string;
  itemId: string;
  title: string;
  authorText: string | null;
}): Promise<PrivateAudioItemRow> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("private_audio_items")
    .update({
      title: input.title,
      author_text: input.authorText,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.itemId)
    .eq("owner_user_id", input.ownerUserId)
    .select(ITEM_SELECT)
    .maybeSingle();

  if (error) {
    console.error("private_audio_update_error", error.message);
    throw new PrivateAudioApiError("internal_error", 500);
  }

  if (!data) {
    throw new PrivateAudioApiError("not_found", 404);
  }

  return data as PrivateAudioItemRow;
}

export async function insertPrivateAudioItem(input: {
  id: string;
  ownerUserId: string;
  title: string;
  authorText: string | null;
  audioPath: string;
  audioMimeType: string;
  audioSizeBytes: number;
  durationSeconds: number;
  originalFilename: string | null;
  coverPath: string | null;
  rightsAcceptedAt: string;
}): Promise<PrivateAudioItemRow> {
  const service = createServiceRoleClient();
  const now = new Date().toISOString();

  const { data, error } = await service
    .from("private_audio_items")
    .insert({
      id: input.id,
      owner_user_id: input.ownerUserId,
      source_type: "manual_upload",
      title: input.title,
      author_text: input.authorText,
      audio_path: input.audioPath,
      audio_mime_type: input.audioMimeType,
      audio_size_bytes: input.audioSizeBytes,
      duration_seconds: input.durationSeconds,
      original_filename: input.originalFilename,
      cover_path: input.coverPath,
      rights_accepted_at: input.rightsAcceptedAt,
      created_at: now,
      updated_at: now,
    })
    .select(ITEM_SELECT)
    .single();

  if (error) {
    console.error("private_audio_insert_error", error.message);
    throw new PrivateAudioApiError("internal_error", 500);
  }

  return data as PrivateAudioItemRow;
}

export async function updatePrivateAudioCoverPath(input: {
  ownerUserId: string;
  itemId: string;
  coverPath: string | null;
}): Promise<PrivateAudioItemRow> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("private_audio_items")
    .update({
      cover_path: input.coverPath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.itemId)
    .eq("owner_user_id", input.ownerUserId)
    .select(ITEM_SELECT)
    .maybeSingle();

  if (error) {
    console.error("private_audio_cover_update_error", error.message);
    throw new PrivateAudioApiError("internal_error", 500);
  }

  if (!data) {
    throw new PrivateAudioApiError("not_found", 404);
  }

  return data as PrivateAudioItemRow;
}

export async function deletePrivateAudioItemRow(input: {
  ownerUserId: string;
  itemId: string;
}): Promise<PrivateAudioItemRow> {
  const service = createServiceRoleClient();
  const existing = await getOwnedPrivateAudioItem(input.ownerUserId, input.itemId);

  const { error } = await service
    .from("private_audio_items")
    .delete()
    .eq("id", input.itemId)
    .eq("owner_user_id", input.ownerUserId);

  if (error) {
    console.error("private_audio_delete_error", error.message);
    throw new PrivateAudioApiError("internal_error", 500);
  }

  return existing;
}

export async function listPrivateAudioItemsForUserAdmin(
  ownerUserId: string,
): Promise<PrivateAudioItemRow[]> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("private_audio_items")
    .select(ITEM_SELECT)
    .eq("owner_user_id", ownerUserId);

  if (error) {
    console.error("private_audio_admin_list_error", error.message);
    throw new Error("private_audio_admin_list_failed");
  }

  return (data ?? []) as PrivateAudioItemRow[];
}
