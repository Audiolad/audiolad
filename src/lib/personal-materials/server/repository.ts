import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PERSONAL_MATERIAL_TYPES,
  type PersonalMaterialRow,
  type PersonalMaterialType,
} from "@/lib/personal-materials/types";
import { tokenHashToPostgresBytea } from "@/lib/personal-materials/tokens";

import {
  PersonalMaterialApiError,
  mapPersonalMaterialRpcError,
} from "./errors";

const MATERIAL_SELECT =
  "id, author_id, created_by, material_type, title, client_first_name, client_last_name, material_date, description, personal_recommendation, return_url, return_button_label, audio_path, audio_original_filename, audio_mime_type, audio_size_bytes, duration_seconds, pdf_path, pdf_original_filename, pdf_mime_type, pdf_size_bytes, status, guest_access_enabled, expires_at, claimed_by_user_id, claimed_at, first_opened_at, first_audio_started_at, revoked_at, deleted_at, created_at, updated_at";

function throwRpcError(error: { message: string }) {
  const mapped = mapPersonalMaterialRpcError(error.message);
  throw new PersonalMaterialApiError(mapped.code, mapped.status);
}

export async function listAuthorPersonalMaterials(
  supabase: SupabaseClient,
  authorId: string,
): Promise<PersonalMaterialRow[]> {
  const { data, error } = await supabase
    .from("personal_materials")
    .select(MATERIAL_SELECT)
    .eq("author_id", authorId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("personal_material_list_error", error.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return (data ?? []) as PersonalMaterialRow[];
}

export async function getAuthorPersonalMaterialById(
  supabase: SupabaseClient,
  materialId: string,
): Promise<PersonalMaterialRow | null> {
  const { data, error } = await supabase
    .from("personal_materials")
    .select(MATERIAL_SELECT)
    .eq("id", materialId)
    .maybeSingle();

  if (error) {
    console.error("personal_material_get_error", error.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return (data as PersonalMaterialRow | null) ?? null;
}

export async function getAuthorNotes(
  supabase: SupabaseClient,
  materialId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("personal_material_author_notes")
    .select("author_notes")
    .eq("personal_material_id", materialId)
    .maybeSingle();

  if (error) {
    console.error("personal_material_notes_error", error.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return data?.author_notes ?? null;
}

export type CreatePersonalMaterialInput = {
  authorId: string;
  materialType: PersonalMaterialType;
  title?: string | null;
  clientFirstName: string;
  clientLastName: string | null;
  materialDate: string;
  description?: string | null;
  personalRecommendation?: string | null;
  returnUrl?: string | null;
  returnButtonLabel?: string | null;
};

export async function createPersonalMaterialDraft(
  supabase: SupabaseClient,
  input: CreatePersonalMaterialInput,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_personal_material", {
    p_author_id: input.authorId,
    p_client_first_name: input.clientFirstName,
    p_client_last_name: input.clientLastName,
    p_material_date: input.materialDate,
    p_material_type: input.materialType,
    p_title: input.title ?? null,
    p_description: input.description ?? null,
    p_personal_recommendation: input.personalRecommendation ?? null,
    p_author_notes: null,
    p_return_url: input.returnUrl ?? null,
    p_return_button_label: input.returnButtonLabel ?? null,
  });

  if (error) {
    throwRpcError(error);
  }

  const materialId = (data as { material_id?: string } | null)?.material_id;

  if (!materialId) {
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return materialId;
}

export type UpdatePersonalMaterialDraftInput = {
  materialId: string;
  clientFirstName: string;
  clientLastName: string | null;
  materialDate: string;
  title?: string | null;
  description?: string | null;
  personalRecommendation?: string | null;
  returnUrl?: string | null;
  returnButtonLabel?: string | null;
};

export async function updatePersonalMaterialDraft(
  supabase: SupabaseClient,
  input: UpdatePersonalMaterialDraftInput,
): Promise<void> {
  const { error } = await supabase.rpc("update_personal_material_draft", {
    p_material_id: input.materialId,
    p_client_first_name: input.clientFirstName,
    p_client_last_name: input.clientLastName,
    p_material_date: input.materialDate,
    p_title: input.title ?? null,
    p_description: input.description ?? null,
    p_personal_recommendation: input.personalRecommendation ?? null,
    p_author_notes: null,
    p_return_url: input.returnUrl ?? null,
    p_return_button_label: input.returnButtonLabel ?? null,
  });

  if (error) {
    throwRpcError(error);
  }
}

export async function activatePersonalMaterial(
  supabase: SupabaseClient,
  materialId: string,
  tokenHash: Buffer,
): Promise<void> {
  const { error } = await supabase.rpc("activate_personal_material", {
    p_material_id: materialId,
    p_access_token_hash: tokenHashToPostgresBytea(tokenHash),
  });

  if (error) {
    throwRpcError(error);
  }
}

export async function rotatePersonalMaterialAccessToken(
  supabase: SupabaseClient,
  materialId: string,
  tokenHash: Buffer,
  enableGuestAccess: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("rotate_personal_material_access_token", {
    p_material_id: materialId,
    p_new_access_token_hash: tokenHashToPostgresBytea(tokenHash),
    p_enable_guest_access: enableGuestAccess,
  });

  if (error) {
    throwRpcError(error);
  }
}

export async function revokePersonalMaterial(
  supabase: SupabaseClient,
  materialId: string,
): Promise<void> {
  const { error } = await supabase.rpc("revoke_personal_material", {
    p_material_id: materialId,
  });

  if (error) {
    throwRpcError(error);
  }
}

export async function softDeletePersonalMaterial(
  supabase: SupabaseClient,
  materialId: string,
): Promise<void> {
  const { error } = await supabase.rpc("soft_delete_personal_material", {
    p_material_id: materialId,
  });

  if (error) {
    throwRpcError(error);
  }
}

export async function clearPersonalMaterialDraftAudio(
  supabase: SupabaseClient,
  materialId: string,
): Promise<void> {
  const { error } = await supabase.rpc("clear_personal_material_draft_audio", {
    p_material_id: materialId,
  });

  if (error) {
    throwRpcError(error);
  }
}

export async function setPersonalMaterialExpiresAt(
  service: SupabaseClient,
  materialId: string,
  expiresAt: string | null,
): Promise<void> {
  const { error } = await service
    .from("personal_materials")
    .update({ expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq("id", materialId);

  if (error) {
    console.error("personal_material_expires_update_error", error.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }
}

export function isValidMaterialType(value: string): value is PersonalMaterialType {
  return (PERSONAL_MATERIAL_TYPES as readonly string[]).includes(value);
}

export async function updatePersonalMaterialDraftMetadata(
  service: SupabaseClient,
  materialId: string,
  input: Partial<{
    material_type: PersonalMaterialType;
  }>,
): Promise<void> {
  if (Object.keys(input).length === 0) {
    return;
  }

  const { error } = await service
    .from("personal_materials")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", materialId)
    .eq("status", "draft");

  if (error) {
    console.error("personal_material_metadata_update_error", error.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }
}
