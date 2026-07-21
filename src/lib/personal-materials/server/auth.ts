import {
  AuthorAccessError,
  requireAuthenticatedUser,
  requireAuthorMembership,
} from "@/lib/author-products/auth";

import type { PersonalMaterialRow } from "@/lib/personal-materials/types";

import { PersonalMaterialApiError } from "./errors";

export { requireAuthenticatedUser, requireAuthorMembership };

const MATERIAL_SELECT =
  "id, author_id, created_by, material_type, title, client_first_name, client_last_name, material_date, description, personal_recommendation, return_url, return_button_label, audio_path, audio_original_filename, audio_mime_type, audio_size_bytes, duration_seconds, pdf_path, pdf_original_filename, pdf_mime_type, pdf_size_bytes, status, guest_access_enabled, expires_at, claimed_by_user_id, claimed_at, first_opened_at, first_audio_started_at, revoked_at, deleted_at, created_at, updated_at";

export async function requirePersonalMaterialAccess(materialId: string) {
  const { supabase, user } = await requireAuthenticatedUser();

  const { data: material, error } = await supabase
    .from("personal_materials")
    .select(MATERIAL_SELECT)
    .eq("id", materialId)
    .maybeSingle();

  if (error) {
    console.error("personal_material_lookup_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  if (!material?.id || !material.author_id) {
    throw new AuthorAccessError("not_found", 404);
  }

  const { data: membership, error: membershipError } = await supabase
    .from("author_members")
    .select("role")
    .eq("author_id", material.author_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    console.error("personal_material_membership_error", membershipError.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  if (
    !membership ||
    (membership.role !== "owner" && membership.role !== "editor")
  ) {
    throw new AuthorAccessError("forbidden", 403);
  }

  return {
    supabase,
    user,
    material: material as PersonalMaterialRow,
    role: membership.role,
  };
}

export function assertDraftEditable(material: PersonalMaterialRow) {
  if (material.status !== "draft") {
    throw new PersonalMaterialApiError("material_not_editable", 409);
  }
}

/** Author may edit draft, active, and revoked materials; tokens unchanged on edit. */
export function assertAuthorEditable(material: PersonalMaterialRow) {
  if (
    material.status !== "draft" &&
    material.status !== "active" &&
    material.status !== "revoked"
  ) {
    throw new PersonalMaterialApiError("material_not_editable", 409);
  }
}

export async function requireAuthorMaterialListAccess(authorId: string) {
  return requireAuthorMembership(authorId);
}
