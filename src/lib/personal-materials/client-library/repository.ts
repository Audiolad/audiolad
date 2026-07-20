import type { SupabaseClient } from "@supabase/supabase-js";

import { mapPersonalMaterialRpcError, PersonalMaterialApiError } from "@/lib/personal-materials/server/errors";
import {
  toMyPersonalMaterialDetailDto,
  toMyPersonalMaterialListItemDto,
} from "./mappers";
import type {
  MyPersonalMaterialDetailDto,
  MyPersonalMaterialListItemDto,
  MyPersonalMaterialProgressDto,
  MyPersonalMaterialProgressInput,
} from "./types";
import { isProgressCompleted } from "./display";

function throwMappedRpc(error: { message: string }): never {
  const mapped = mapPersonalMaterialRpcError(error.message);
  throw new PersonalMaterialApiError(mapped.code, mapped.status);
}

export async function listMyPersonalMaterials(
  supabase: SupabaseClient,
): Promise<MyPersonalMaterialListItemDto[]> {
  const { data, error } = await supabase.rpc("list_claimed_personal_materials");

  if (error) {
    throwMappedRpc(error);
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((row) =>
    toMyPersonalMaterialListItemDto(row as Record<string, unknown>),
  );
}

export async function getMyPersonalMaterial(
  supabase: SupabaseClient,
  materialId: string,
): Promise<MyPersonalMaterialDetailDto> {
  const { data, error } = await supabase.rpc("get_claimed_personal_material", {
    p_material_id: materialId,
  });

  if (error) {
    throwMappedRpc(error);
  }

  if (!data || typeof data !== "object") {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  return toMyPersonalMaterialDetailDto(data as Record<string, unknown>);
}

export async function getMyPersonalMaterialProgress(
  supabase: SupabaseClient,
  materialId: string,
  durationSeconds: number | null = null,
): Promise<MyPersonalMaterialProgressDto> {
  const { data, error } = await supabase.rpc("get_personal_material_progress", {
    p_material_id: materialId,
  });

  if (error) {
    throwMappedRpc(error);
  }

  const record = (data ?? {}) as Record<string, unknown>;
  const positionSeconds =
    typeof record.position_seconds === "number" ? record.position_seconds : 0;
  const completed =
    record.completed === true ||
    isProgressCompleted({ positionSeconds, durationSeconds });

  return {
    positionSeconds,
    durationSeconds,
    completed,
    updatedAt: typeof record.updated_at === "string" ? record.updated_at : null,
  };
}

export async function saveMyPersonalMaterialProgress(
  supabase: SupabaseClient,
  materialId: string,
  input: MyPersonalMaterialProgressInput,
): Promise<MyPersonalMaterialProgressDto> {
  if (!Number.isFinite(input.positionSeconds) || input.positionSeconds < 0) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  const completed =
    input.completed === true ||
    isProgressCompleted({
      positionSeconds: input.positionSeconds,
      durationSeconds: input.durationSeconds,
      completed: input.completed,
    });

  const { data, error } = await supabase.rpc("upsert_personal_material_progress", {
    p_material_id: materialId,
    p_position_seconds: Math.floor(input.positionSeconds),
    p_completed: completed,
  });

  if (error) {
    throwMappedRpc(error);
  }

  const record = (data ?? {}) as Record<string, unknown>;

  return {
    positionSeconds:
      typeof record.position_seconds === "number"
        ? record.position_seconds
        : Math.floor(input.positionSeconds),
    durationSeconds: input.durationSeconds ?? null,
    completed: record.completed === true || completed,
    updatedAt: new Date().toISOString(),
  };
}
