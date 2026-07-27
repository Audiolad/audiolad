import {
  sortAdminCommercialApplicationsByAttention,
  summarizeCommercialApplicationAttention,
  type CommercialApplicationAttentionSummary,
} from "@/lib/admin/commercial-application-attention";
import {
  AUTHOR_COMMERCIAL_APPLICATION_COLUMNS,
} from "@/lib/author-commercial-applications/queries";
import type {
  AdminAuthorCommercialApplicationDetail,
  AuthorCommercialApplicationRow,
  AuthorCommercialApplicationStatus,
  AuthorCommercialApplicationStatusEventRow,
} from "@/lib/author-commercial-applications/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AdminCommercialApplicationListItem = {
  id: string;
  authorId: string;
  authorName: string;
  authorSlug: string;
  plannedProducts: string;
  topics: string;
  formatPlan: string;
  status: AuthorCommercialApplicationStatus;
  submittedAt: string | null;
  createdAt: string;
  isNew: boolean;
};

function mapListRow(row: {
  id: unknown;
  author_id: unknown;
  status: unknown;
  planned_products?: unknown;
  topics: unknown;
  format_plan: unknown;
  submitted_at: unknown;
  created_at: unknown;
  authors?:
    | { name?: string; slug?: string }
    | { name?: string; slug?: string }[]
    | null;
}): AdminCommercialApplicationListItem {
  const authorsValue = row.authors ?? null;
  const author = Array.isArray(authorsValue) ? authorsValue[0] : authorsValue;

  return {
    id: row.id as string,
    authorId: row.author_id as string,
    authorName: author?.name?.trim() || "Автор",
    authorSlug: author?.slug?.trim() || "",
    plannedProducts: String(row.planned_products ?? ""),
    topics: String(row.topics ?? ""),
    formatPlan: String(row.format_plan ?? ""),
    status: row.status as AuthorCommercialApplicationStatus,
    submittedAt: (row.submitted_at as string | null) ?? null,
    createdAt: row.created_at as string,
    isNew: row.status === "submitted",
  };
}

export async function listAdminCommercialApplications(input?: {
  status?: AuthorCommercialApplicationStatus | null;
}): Promise<AdminCommercialApplicationListItem[]> {
  const service = createServiceRoleClient();

  let query = service
    .from("author_commercial_applications")
    .select(
      `
      id,
      author_id,
      status,
      planned_products,
      topics,
      format_plan,
      submitted_at,
      created_at,
      authors (
        name,
        slug
      )
    `,
    )
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (input?.status) {
    query = query.eq("status", input.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("admin_commercial_applications_list_error", error.message);
    throw new Error("admin_commercial_applications_list_failed");
  }

  const items = (data ?? []).map((row) => mapListRow(row));

  return sortAdminCommercialApplicationsByAttention(items);
}

export async function getAdminCommercialApplicationAttentionSummary(): Promise<CommercialApplicationAttentionSummary> {
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from("author_commercial_applications")
    .select("status")
    .in("status", ["submitted", "needs_changes", "in_review"]);

  if (error) {
    console.error(
      "admin_commercial_applications_attention_error",
      error.message,
    );
    throw new Error("admin_commercial_applications_attention_failed");
  }

  return summarizeCommercialApplicationAttention(
    (data ?? []).map((row) => String(row.status ?? "")),
  );
}

export async function getAdminCommercialApplication(
  applicationId: string,
): Promise<AdminAuthorCommercialApplicationDetail | null> {
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from("author_commercial_applications")
    .select(AUTHOR_COMMERCIAL_APPLICATION_COLUMNS)
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    console.error("admin_commercial_application_load_error", error.message);
    throw new Error("admin_commercial_application_load_failed");
  }

  const application = (data as AuthorCommercialApplicationRow | null) ?? null;

  if (!application) {
    return null;
  }

  const [authorResult, profileResult, eventsResult] = await Promise.all([
    service
      .from("authors")
      .select("id, name, slug, access_status")
      .eq("id", application.author_id)
      .maybeSingle(),
    service
      .from("profiles")
      .select("email, full_name")
      .eq("id", application.created_by)
      .maybeSingle(),
    service
      .from("author_commercial_application_status_events")
      .select(
        "id, application_id, from_status, to_status, changed_by, staff_comment, applicant_comment, created_at",
      )
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    ...application,
    authorName: authorResult.data?.name ?? null,
    authorSlug: authorResult.data?.slug ?? null,
    accessStatus: authorResult.data?.access_status ?? null,
    creatorEmail: profileResult.data?.email ?? null,
    creatorDisplayName: profileResult.data?.full_name ?? null,
    applicationEvents: (eventsResult.data ??
      []) as AuthorCommercialApplicationStatusEventRow[],
  };
}
