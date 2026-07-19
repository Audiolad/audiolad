import type { AuthorApplicationRow } from "@/lib/author-applications/types";
import { formatApplicationContactSummary } from "@/lib/author-applications/queries";
import { loadUserDeletionDependencies } from "@/lib/admin/user-deletion";
import { evaluateUserDeletionEligibility } from "@/lib/admin/user-deletion-policy";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getPlatformRoleLabel } from "@/lib/auth/platform-admin";

export type AdminStatCard =
  | { kind: "value"; key: string; label: string; value: number }
  | { kind: "currency"; key: string; label: string; valueRub: number }
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

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

async function countPublishedPrograms(
  service: ReturnType<typeof createServiceRoleClient>,
): Promise<number> {
  const { data: practices, error } = await service
    .from("practices")
    .select("id")
    .eq("status", "published");

  if (error || !practices?.length) {
    return 0;
  }

  const practiceIds = practices.map((row) => row.id);

  const { data: audioItems, error: audioError } = await service
    .from("audio_items")
    .select("practice_id")
    .in("practice_id", practiceIds)
    .eq("status", "published");

  if (audioError) {
    return 0;
  }

  const counts = new Map<string, number>();

  for (const item of audioItems ?? []) {
    counts.set(item.practice_id, (counts.get(item.practice_id) ?? 0) + 1);
  }

  return [...counts.values()].filter((count) => count >= 2).length;
}

export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  const service = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const sevenDaysAgo = daysAgoIso(7);
  const thirtyDaysAgo = daysAgoIso(30);

  const [
    usersTotal,
    users7d,
    users30d,
    authorsTotal,
    applicationsTotal,
    applicationsNew,
    publishedPractices,
    publishedPrograms,
    completedListens,
    paidOrders,
    revenueResult,
  ] = await Promise.all([
    service.from("profiles").select("*", { count: "exact", head: true }),
    service
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
    service
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo),
    service
      .from("author_members")
      .select("user_id", { count: "exact", head: true }),
    service.from("author_applications").select("*", { count: "exact", head: true }),
    service
      .from("author_applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "submitted"),
    service
      .from("practices")
      .select("*", { count: "exact", head: true })
      .eq("status", "published"),
    countPublishedPrograms(service),
    service
      .from("practice_audio_progress")
      .select("*", { count: "exact", head: true })
      .eq("completed", true),
    service
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "paid"),
    service.from("orders").select("amount_minor").eq("status", "paid"),
  ]);

  const revenueMinor = (revenueResult.data ?? []).reduce(
    (sum, row) => sum + (typeof row.amount_minor === "number" ? row.amount_minor : 0),
    0,
  );

  const authorMemberCount = authorsTotal.count ?? 0;

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
      label: "Новых за 7 дней",
      value: users7d.count ?? 0,
    },
    {
      kind: "value",
      key: "users_30d",
      label: "Новых за 30 дней",
      value: users30d.count ?? 0,
    },
    {
      kind: "value",
      key: "authors_total",
      label: "Всего авторов",
      value: authorMemberCount,
    },
    {
      kind: "value",
      key: "applications_new",
      label: "Новых заявок на авторство",
      value: applicationsNew.count ?? 0,
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
      kind: "unavailable",
      key: "playback_starts",
      label: "Общих запусков прослушивания",
      reason: "Данные пока не собираются",
    },
    {
      kind: "value",
      key: "completions",
      label: "Дослушиваний (progress DB)",
      value: completedListens.count ?? 0,
    },
    {
      kind: "value",
      key: "paid_orders",
      label: "Успешных заказов",
      value: paidOrders.count ?? 0,
    },
    {
      kind: "currency",
      key: "revenue",
      label: "Подтверждённая выручка",
      valueRub: revenueMinor / 100,
    },
  ];

  return {
    cards,
    generatedAt: nowIso,
  };
}

export async function listAdminAuthorApplications(input?: {
  status?: AuthorApplicationRow["status"] | null;
}): Promise<AdminApplicationListItem[]> {
  const service = createServiceRoleClient();

  let query = service
    .from("author_applications")
    .select(
      "id, display_name, contact_email, contact_details, direction, about, status, submitted_at, created_at",
    )
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (input?.status) {
    query = query.eq("status", input.status);
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
): Promise<AuthorApplicationRow | null> {
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from("author_applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    throw new Error("admin_application_load_failed");
  }

  return (data as AuthorApplicationRow | null) ?? null;
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
    const escaped = search.replace(/[%_,]/g, "");
    query = query.or(
      `full_name.ilike.%${escaped}%,email.ilike.%${escaped}%`,
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
