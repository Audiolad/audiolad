import {
  AuthorAccessError,
  assertAuthorContentMutationsAllowed,
  getAuthorAccessStatusForMembership,
  requireAuthenticatedUser,
  requireAuthorMutationMembership,
  requireAuthorMembership,
} from "@/lib/author-products/auth";

import type { PersonalMaterialRow } from "@/lib/personal-materials/types";
import { recordAuthorSupportAudit } from "@/lib/author-support/audit";
import {
  peekAuthorExecutionContext,
  requestedAuthorMatchesSupport,
} from "@/lib/author-support/context";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { PersonalMaterialApiError } from "./errors";

export { requireAuthenticatedUser, requireAuthorMembership };

const MATERIAL_SELECT =
  "id, author_id, created_by, material_type, title, client_first_name, client_last_name, material_date, description, personal_recommendation, return_url, return_button_label, audio_path, audio_original_filename, audio_mime_type, audio_size_bytes, duration_seconds, pdf_path, pdf_original_filename, pdf_mime_type, pdf_size_bytes, status, guest_access_enabled, expires_at, claimed_by_user_id, claimed_at, first_opened_at, first_audio_started_at, revoked_at, deleted_at, created_at, updated_at";

export async function requirePersonalMaterialReadAccess(materialId: string) {
  const { supabase, user } = await requireAuthenticatedUser();
  const execution = await peekAuthorExecutionContext();
  const lookupClient = execution?.isSupportMode
    ? createServiceRoleClient()
    : supabase;

  const { data: material, error } = await lookupClient
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

  if (
    execution?.isSupportMode &&
    !requestedAuthorMatchesSupport(execution, material.author_id)
  ) {
    throw new AuthorAccessError("forbidden", 403);
  }

  const membership = await requireAuthorMembership(material.author_id);

  return {
    supabase: membership.supabase,
    user,
    material: material as PersonalMaterialRow,
    role: membership.role,
  };
}

export async function requirePersonalMaterialAccess(materialId: string) {
  const context = await requirePersonalMaterialReadAccess(materialId);
  const accessStatus = await getAuthorAccessStatusForMembership(
    context.supabase,
    context.material.author_id,
  );
  assertAuthorContentMutationsAllowed(accessStatus);
  await recordAuthorSupportAudit({
    action: "personal_material_updated",
    resourceType: "personal_material",
    resourceId: materialId,
  });

  return {
    ...context,
    accessStatus,
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
  return requireAuthorMutationMembership(authorId, {
    action: "personal_material_updated",
    resourceType: "personal_material",
  });
}

export async function requireAuthorMaterialListReadAccess(authorId: string) {
  return requireAuthorMembership(authorId);
}
