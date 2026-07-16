import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AuthorApplicationFormValues,
  AuthorApplicationRow,
  AuthorApplicationStatus,
  BecomeAuthorPageView,
} from "./types";
import { AUTHOR_APPLICATION_DEFAULT_PLANNED_CONTENT } from "./validation";
import { resolveBecomeAuthorAudience } from "./status";

export async function getCurrentAuthorApplication(
  supabase: SupabaseClient,
  userId: string,
): Promise<AuthorApplicationRow | null> {
  const { data, error } = await supabase
    .from("author_applications")
    .select(
      `
      id,
      user_id,
      status,
      display_name,
      contact,
      direction,
      experience,
      about,
      planned_content,
      links,
      has_ready_materials,
      wants_training,
      interested_in_school,
      consent_personal_data,
      submitted_at,
      reviewed_at,
      reviewed_by,
      review_comment,
      created_at,
      updated_at
    `,
    )
    .eq("user_id", userId)
    .neq("status", "withdrawn")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("author_application_load_error", error.message);
    throw new Error("author_application_load_failed");
  }

  return (data as AuthorApplicationRow | null) ?? null;
}

export async function getBecomeAuthorPageView(
  supabase: SupabaseClient,
  input: {
    user: { id: string; email?: string } | null;
    workspaceCount: number;
    showSubmittedBanner: boolean;
  },
): Promise<BecomeAuthorPageView> {
  const application = input.user
    ? await getCurrentAuthorApplication(supabase, input.user.id).catch(() => null)
    : null;

  return {
    audience: resolveBecomeAuthorAudience({
      isAuthenticated: Boolean(input.user),
      workspaceCount: input.workspaceCount,
      applicationStatus: application?.status ?? null,
    }),
    application,
    workspaceCount: input.workspaceCount,
    userEmail: input.user?.email?.trim() ?? null,
    showSubmittedBanner: input.showSubmittedBanner,
  };
}

function resolvePlannedContentForSubmit(
  existing: AuthorApplicationRow | null,
): string {
  const existingContent = existing?.planned_content?.trim() ?? "";
  if (existingContent.length >= 20) {
    return existingContent;
  }

  return AUTHOR_APPLICATION_DEFAULT_PLANNED_CONTENT;
}

function resolveLinksForSubmit(existing: AuthorApplicationRow | null): string | null {
  return existing?.links?.trim() ? existing.links : null;
}

export function mapApplicationInsertPayload(
  userId: string,
  values: AuthorApplicationFormValues,
  status: Extract<AuthorApplicationStatus, "draft" | "submitted">,
) {
  return {
    user_id: userId,
    status,
    display_name: values.displayName,
    direction: values.direction,
    about: values.about,
    experience: null,
    planned_content: AUTHOR_APPLICATION_DEFAULT_PLANNED_CONTENT,
    links: null,
    contact: values.contact,
    has_ready_materials: values.hasReadyMaterials,
    wants_training: values.wantsTraining,
    interested_in_school: values.interestedInSchool,
    consent_personal_data: values.consentPersonalData,
    submitted_at: status === "submitted" ? new Date().toISOString() : null,
  };
}

export function mapApplicationUpdatePayload(
  values: AuthorApplicationFormValues,
  existing: AuthorApplicationRow | null,
  status?: Extract<AuthorApplicationStatus, "draft" | "submitted">,
) {
  return {
    display_name: values.displayName,
    direction: values.direction,
    about: values.about,
    experience: null,
    planned_content: resolvePlannedContentForSubmit(existing),
    links: resolveLinksForSubmit(existing),
    contact: values.contact,
    has_ready_materials: values.hasReadyMaterials,
    wants_training: values.wantsTraining,
    interested_in_school: values.interestedInSchool,
    consent_personal_data: values.consentPersonalData,
    ...(status
      ? {
          status,
          submitted_at:
            status === "submitted" ? new Date().toISOString() : undefined,
        }
      : {}),
  };
}

export function isDuplicateActiveApplicationError(message: string): boolean {
  return (
    message.includes("author_applications_user_non_withdrawn_unique_idx") ||
    message.includes("duplicate key value")
  );
}
