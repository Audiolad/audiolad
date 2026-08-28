import type {
  AdminAuthorApplicationDetail,
  AuthorAccessStatusEventRow,
  AuthorApplicationRow,
  AuthorApplicationStatusEventRow,
} from "@/lib/author-applications/types";
import {
  AUTHOR_APPLICATION_COLUMNS,
  formatApplicationContactSummary,
} from "@/lib/author-applications/queries";
import {
  AUTHOR_APPLICATION_ATTENTION_STATUSES,
  summarizeAuthorApplicationAttention,
  type AuthorApplicationAttentionSummary,
} from "@/lib/admin/author-application-attention";
import { loadUserDeletionDependencies } from "@/lib/admin/user-deletion";
import { evaluateUserDeletionEligibility } from "@/lib/admin/user-deletion-policy";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOperationalEmailDeliveryForApplication } from "@/lib/email/operational-deliveries";
import { getPlatformRoleLabel } from "@/lib/auth/platform-admin";
import {
  calculateNetRevenueMinor,
  countDistinctOwnerUsers,
  countDistinctOwnerWorkspaces,
  countPublishedPracticePrograms,
  createOperationalTimeRange,
} from "@/lib/admin/operational-overview";
import {
  buildAdminUsersProfileSearchOr,
  isAdminExactUuid,
  isAdminProductSlugQuery,
} from "@/lib/admin/users-search";

export type AdminStatCard =
  | { kind: "value"; key: string; label: string; value: number }
  | { kind: "currency"; key: string; label: string; valueMinor: number }
  | { kind: "unavailable"; key: string; label: string; reason: string };

export type AdminOverviewStats = {
  cards: AdminStatCard[];
  generatedAt: string;
};

export type AdminApplicationListItem = {
  id: string;
  displayName: string;
  contactEmail: string | null;
  contactDetails: string | null;
  contactSummary: string;
  direction: string;
  about: string;
  status: AuthorApplicationRow["status"];
  submittedAt: string | null;
  createdAt: string;
  isNew: boolean;
};

export type AdminUserListItem = {
  id: string;
  displayName: string;
  email: string | null;
  role: string;
  roleLabel: string;
  createdAt: string;
  isAuthor: boolean;
  practiceCount: number | null;
  canDelete: boolean;
  deleteBlockReason: string | null;
};

export type AdminUsersPageData = {
  users: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  roleFilter: string;
  actorUserId: string;
};

const USERS_PAGE_SIZE = 20;

async function countPublishedPrograms(
  service: ReturnType<typeof createServiceRoleClient>,
): Promise<number> {
  const { data: practices, error } = await service
    .from("practices")
    .select("id")
    .eq("status", "published")
    .eq("product_kind", "practice")
    .is("deleted_at", null);

  if (error) {
    throw new Error("admin_published_programs_load_failed");
  }

  if (!practices?.length) {
    return 0;
  }

  const practiceIds = practices.map((row) => row.id);

  const { data: audioItems, error: audioError } = await service
    .from("audio_items")
    .select("id, practice_id")
    .in("practice_id", practiceIds)
    .eq("status", "published");

  if (audioError) {
    throw new Error("admin_published_program_tracks_load_failed");
  }

  return countPublishedPracticePrograms(audioItems ?? []);
}

export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  const service = createServiceRoleClient();
  const timeRange = createOperationalTimeRange();

  const [
    usersTotal,
    users7d,
    users30d,
    ownerMembers,
    applicationsTotal,
    applicationsSubmitted7d,
    applicationsAwaitingReview,
    publishedPractices,
    publishedPrograms,
    playbackStarts,
    completions,
    succeededPayments,
    confirmedRefunds,
  ] = await Promise.all([
    service.from("profiles").select("*", { count: "exact", head: true }),
    service
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", timeRange.sevenDaysAgoIso)
      .lt("created_at", timeRange.snapshotNowIso),
    service
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", timeRange.thirtyDaysAgoIso)
      .lt("created_at", timeRange.snapshotNowIso),
    service
      .from("author_members")
      .select("user_id, author_id, authors!inner(access_status)")
      .eq("role", "owner")
      .not("authors.access_status", "in", "(suspended,terminated)"),
    service.from("author_applications").select("*", { count: "exact", head: true }),
    service
      .from("author_applications")
      .select("*", { count: "exact", head: true })
      .gte("submitted_at", timeRange.sevenDaysAgoIso)
      .lt("submitted_at", timeRange.snapshotNowIso),
    service
      .from("author_applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "submitted"),
    service
      .from("practices")
      .select("*", { count: "exact", head: true })
      .eq("status", "published")
      .eq("product_kind", "practice")
      .is("deleted_at", null),
    countPublishedPrograms(service),
    service
      .from("analytics_events")
      .select("*", { count: "exact", head: true })
      .eq("event_name", "audio_play_started")
      .eq("is_bot", false)
      .eq("is_staff", false)
      .eq("is_test", false),
    service
      .from("analytics_events")
      .select("*", { count: "exact", head: true })
      .eq("event_name", "audio_completed")
      .eq("is_bot", false)
      .eq("is_staff", false)
      .eq("is_test", false),
    service
      .from("payments")
      .select("order_id, amount_minor")
      .eq("status", "succeeded")
      .eq("is_test", false),
    service
      .from("payment_refunds")
      .select("amount_minor")
      .eq("status", "succeeded")
      .eq("is_test", false)
      .not("confirmed_at", "is", null),
  ]);

  if (
    [
      usersTotal,
      users7d,
      users30d,
      ownerMembers,
      applicationsTotal,
      applicationsSubmitted7d,
      applicationsAwaitingReview,
      publishedPractices,
      playbackStarts,
      completions,
      succeededPayments,
      confirmedRefunds,
    ].some((result) => result.error)
  ) {
    throw new Error("admin_overview_stats_load_failed");
  }

  const owners = ownerMembers.data ?? [];
  const successfulOrderCount = new Set(
    (succeededPayments.data ?? []).map((payment) => payment.order_id),
  ).size;
  const revenueMinor = calculateNetRevenueMinor(
    succeededPayments.data ?? [],
    confirmedRefunds.data ?? [],
  );

  const cards: AdminStatCard[] = [
    {
      kind: "value",
      key: "users_total",
      label: "Всего пользователей",
      value: usersTotal.count ?? 0,
    },
    {
      kind: "value",
      key: "users_7d",
      label: "Новых пользователей за 7 дней",
      value: users7d.count ?? 0,
    },
    {
      kind: "value",
      key: "users_30d",
      label: "Новых пользователей за 30 дней",
      value: users30d.count ?? 0,
    },
    {
      kind: "value",
      key: "authors_total",
      label: "Всего авторов",
      value: countDistinctOwnerUsers(owners),
    },
    {
      kind: "value",
      key: "author_workspaces_total",
      label: "Авторских пространств",
      value: countDistinctOwnerWorkspaces(owners),
    },
    {
      kind: "value",
      key: "applications_submitted_7d",
      label: "Заявок подано за 7 дней",
      value: applicationsSubmitted7d.count ?? 0,
    },
    {
      kind: "value",
      key: "applications_awaiting_review",
      label: "Ожидают рассмотрения",
      value: applicationsAwaitingReview.count ?? 0,
    },
    {
      kind: "value",
      key: "applications_total",
      label: "Всего заявок на авторство",
      value: applicationsTotal.count ?? 0,
    },
    {
      kind: "value",
      key: "practices_published",
      label: "Опубликованных аудиопрактик",
      value: publishedPractices.count ?? 0,
    },
    {
      kind: "value",
      key: "programs_published",
      label: "Опубликованных программ (≥2 трека)",
      value: publishedPrograms,
    },
    {
      kind: "value",
      key: "playback_starts",
      label: "Запусков прослушивания",
      value: playbackStarts.count ?? 0,
    },
    {
      kind: "value",
      key: "completions",
      label: "Дослушиваний",
      value: completions.count ?? 0,
    },
    {
      kind: "value",
      key: "paid_orders",
      label: "Успешных заказов",
      value: successfulOrderCount,
    },
    {
      kind: "currency",
      key: "revenue",
      label: "Выручка после возвратов",
      valueMinor: revenueMinor,
    },
  ];

  return {
    cards,
    generatedAt: timeRange.snapshotNowIso,
  };
}

export async function getAdminAuthorApplicationAttentionSummary(): Promise<AuthorApplicationAttentionSummary> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("author_applications")
    .select("status")
    .in("status", [...AUTHOR_APPLICATION_ATTENTION_STATUSES]);

  if (error) {
    throw new Error("admin_author_application_attention_load_failed");
  }

  return summarizeAuthorApplicationAttention(
    (data ?? []).map((application) => application.status),
  );
}

export async function listAdminAuthorApplications(input?: {
  statuses?: AuthorApplicationRow["status"][] | null;
}): Promise<AdminApplicationListItem[]> {
  const service = createServiceRoleClient();

  let query = service
    .from("author_applications")
    .select(
      "id, display_name, contact_email, contact_details, direction, about, status, submitted_at, created_at",
    )
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (input?.statuses?.length) {
    query = query.in("status", input.statuses);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("admin_applications_list_failed");
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    contactEmail: row.contact_email,
    contactDetails: row.contact_details,
    contactSummary: formatApplicationContactSummary({
      contact_email: row.contact_email,
      contact_details: row.contact_details,
    }),
    direction: row.direction,
    about: row.about,
    status: row.status,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    isNew: row.status === "submitted",
  }));
}

export async function getAdminAuthorApplication(
  applicationId: string,
): Promise<AdminAuthorApplicationDetail | null> {
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from("author_applications")
    .select(AUTHOR_APPLICATION_COLUMNS)
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    throw new Error("admin_application_load_failed");
  }

  const application = (data as AuthorApplicationRow | null) ?? null;

  if (!application) {
    return null;
  }

  const [profileResult, authorResult, applicationEventsResult, accessEventsResult, emailDeliveryResult] =
    await Promise.all([
      service
        .from("profiles")
        .select("email, full_name")
        .eq("id", application.user_id)
        .maybeSingle(),
      application.author_id
        ? service
            .from("authors")
            .select("id, name, slug, access_status")
            .eq("id", application.author_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      service
        .from("author_application_status_events")
        .select(
          "id, application_id, from_status, to_status, changed_by, staff_comment, applicant_comment, created_at",
        )
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false }),
      application.author_id
        ? service
            .from("author_access_status_events")
            .select(
              "id, author_id, application_id, from_status, to_status, changed_by, reason, created_at",
            )
            .eq("author_id", application.author_id)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as AuthorAccessStatusEventRow[], error: null }),
      application.status === "approved"
        ? getOperationalEmailDeliveryForApplication(applicationId)
        : Promise.resolve(null),
    ]);

  const emailDelivery = emailDeliveryResult;

  return {
    ...application,
    userEmail: profileResult.data?.email ?? null,
    userDisplayName: profileResult.data?.full_name ?? null,
    linkedAuthor: authorResult.data
      ? {
          id: authorResult.data.id,
          name: authorResult.data.name,
          slug: authorResult.data.slug,
          accessStatus: authorResult.data.access_status,
        }
      : null,
    accessGrantedEmailDelivery: emailDelivery
      ? {
          status: emailDelivery.status,
          sentAt: emailDelivery.sent_at,
          lastError: emailDelivery.last_error,
          attemptCount: emailDelivery.attempt_count,
          lastAttemptAt: emailDelivery.last_attempt_at,
        }
      : null,
    applicationEvents: (applicationEventsResult.data ??
      []) as AuthorApplicationStatusEventRow[],
    accessEvents: (accessEventsResult.data ?? []) as AuthorAccessStatusEventRow[],
  };
}

function buildDisplayName(
  fullName: string | null,
  email: string | null,
): string {
  const trimmed = fullName?.trim();

  if (trimmed) {
    return trimmed;
  }

  const localPart = email?.split("@")[0]?.trim();

  if (localPart) {
    return localPart;
  }

  return "Пользователь";
}

async function findUserIdsByProductQuery(
  service: ReturnType<typeof createServiceRoleClient>,
  search: string,
): Promise<string[]> {
  const trimmed = search.trim();
  if (!trimmed) {
    return [];
  }

  let practiceQuery = service
    .from("practices")
    .select("author_id")
    .is("deleted_at", null);

  if (isAdminExactUuid(trimmed)) {
    practiceQuery = practiceQuery.eq("id", trimmed);
  } else if (isAdminProductSlugQuery(trimmed)) {
    practiceQuery = practiceQuery.eq("slug", trimmed);
  } else {
    return [];
  }

  const { data: practices, error } = await practiceQuery;
  if (error || !practices?.length) {
    return [];
  }

  const authorIds = [
    ...new Set(
      practices
        .map((row) => row.author_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (authorIds.length === 0) {
    return [];
  }

  const { data: members, error: membersError } = await service
    .from("author_members")
    .select("user_id")
    .in("author_id", authorIds);

  if (membersError || !members?.length) {
    return [];
  }

  return [
    ...new Set(
      members
        .map((row) => row.user_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

export async function listAdminUsers(input: {
  page?: number;
  query?: string;
  roleFilter?: string;
  actorUserId: string;
}): Promise<AdminUsersPageData> {
  const service = createServiceRoleClient();
  const page = Math.max(1, input.page ?? 1);
  const pageSize = USERS_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const search = input.query?.trim() ?? "";
  const roleFilter = input.roleFilter?.trim() ?? "all";

  let query = service
    .from("profiles")
    .select("id, email, full_name, role, created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (roleFilter !== "all") {
    query = query.eq("role", roleFilter);
  }

  if (search) {
    const extraUserIds = await findUserIdsByProductQuery(service, search);
    query = query.or(
      buildAdminUsersProfileSearchOr({
        search,
        extraUserIds,
      }),
    );
  }

  const { data: profiles, error, count } = await query.range(from, to);

  if (error) {
    throw new Error("admin_users_list_failed");
  }

  const userIds = (profiles ?? []).map((row) => row.id);

  const [membersResult, libraryResult] = await Promise.all([
    userIds.length
      ? service.from("author_members").select("user_id").in("user_id", userIds)
      : Promise.resolve({ data: [] as { user_id: string }[], error: null }),
    userIds.length
      ? service
          .from("user_practices")
          .select("user_id")
          .in("user_id", userIds)
      : Promise.resolve({ data: [] as { user_id: string }[], error: null }),
  ]);

  const authorUserIds = new Set(
    (membersResult.data ?? []).map((row) => row.user_id),
  );

  const practiceCountMap = new Map<string, number>();

  for (const row of libraryResult.data ?? []) {
    practiceCountMap.set(row.user_id, (practiceCountMap.get(row.user_id) ?? 0) + 1);
  }

  const deletionDependencies = await loadUserDeletionDependencies(
    service,
    userIds,
  );

  const users: AdminUserListItem[] = (profiles ?? []).map((row) => {
    const eligibility = evaluateUserDeletionEligibility({
      userId: row.id,
      actorUserId: input.actorUserId,
      dependencies: deletionDependencies.get(row.id) ?? null,
    });

    return {
      id: row.id,
      displayName: buildDisplayName(row.full_name, row.email),
      email: row.email,
      role: row.role,
      roleLabel: getPlatformRoleLabel(row.role),
      createdAt: row.created_at,
      isAuthor: authorUserIds.has(row.id),
      practiceCount: practiceCountMap.get(row.id) ?? 0,
      canDelete: eligibility.canDelete,
      deleteBlockReason: eligibility.blockReason,
    };
  });

  return {
    users,
    total: count ?? 0,
    page,
    pageSize,
    query: search,
    roleFilter,
    actorUserId: input.actorUserId,
  };
}

export { USERS_PAGE_SIZE };
