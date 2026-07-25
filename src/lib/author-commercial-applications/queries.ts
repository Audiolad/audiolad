import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AuthorCommercialApplicationRow,
  AuthorCommercialApplicationStatus,
} from "./types";

/** Explicit column list for author_commercial_applications. */
export const AUTHOR_COMMERCIAL_APPLICATION_COLUMNS = `
  id,
  author_id,
  created_by,
  status,
  planned_products,
  topics,
  format_plan,
  rights_confirmation,
  team_comment,
  submitted_at,
  reviewed_at,
  reviewed_by,
  review_comment,
  admin_note,
  created_at,
  updated_at
`;

export async function getAuthorCommercialApplication(
  supabase: SupabaseClient,
  authorId: string,
): Promise<AuthorCommercialApplicationRow | null> {
  const { data, error } = await supabase
    .from("author_commercial_applications")
    .select(AUTHOR_COMMERCIAL_APPLICATION_COLUMNS)
    .eq("author_id", authorId)
    .neq("status", "withdrawn")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("author_commercial_application_load_error", error.message);
    throw new Error("author_commercial_application_load_failed");
  }

  return (data as AuthorCommercialApplicationRow | null) ?? null;
}

export async function getAuthorCommercialApplicationById(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<AuthorCommercialApplicationRow | null> {
  const { data, error } = await supabase
    .from("author_commercial_applications")
    .select(AUTHOR_COMMERCIAL_APPLICATION_COLUMNS)
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    console.error("author_commercial_application_by_id_error", error.message);
    throw new Error("author_commercial_application_load_failed");
  }

  return (data as AuthorCommercialApplicationRow | null) ?? null;
}

export async function listAuthorCommercialApplications(
  supabase: SupabaseClient,
  input?: {
    status?: AuthorCommercialApplicationStatus | null;
    limit?: number;
  },
): Promise<AuthorCommercialApplicationRow[]> {
  let query = supabase
    .from("author_commercial_applications")
    .select(AUTHOR_COMMERCIAL_APPLICATION_COLUMNS)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (input?.status) {
    query = query.eq("status", input.status);
  }

  if (input?.limit && input.limit > 0) {
    query = query.limit(input.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error("author_commercial_applications_list_error", error.message);
    throw new Error("author_commercial_applications_list_failed");
  }

  return (data as AuthorCommercialApplicationRow[] | null) ?? [];
}
