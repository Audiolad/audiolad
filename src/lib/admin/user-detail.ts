import { isAdminExactUuid } from "@/lib/admin/users-search";
import {
  getAuthorAccessStatusLabel,
  type AuthorAccessStatus,
} from "@/lib/authors/access";
import { getPlatformRoleLabel as getLegacyProfileRoleLabel } from "@/lib/auth/platform-admin";
import {
  legacyProfileRoleToTeamRoles,
  type PlatformTeamRole,
} from "@/lib/auth/platform-permissions";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AdminUserAuthorSpace = {
  authorId: string;
  name: string;
  slug: string;
  membershipRole: string;
  accessStatus: string;
  accessStatusLabel: string;
  canBypassProductModeration: boolean;
};

export type AdminUserAuthorProduct = {
  id: string;
  title: string;
  slug: string;
  productKind: string;
  publicationClass: string | null;
  format: string | null;
  status: string;
  moderationStatus: string;
  updatedAt: string;
  authorId: string;
  authorName: string;
};

export type AdminUserDetail = {
  id: string;
  displayName: string;
  email: string | null;
  profileRole: string;
  profileRoleLabel: string;
  teamRoles: PlatformTeamRole[];
  teamRoleLabels: string[];
  createdAt: string;
  authorSpaces: AdminUserAuthorSpace[];
  products: AdminUserAuthorProduct[];
};

const TEAM_ROLE_LABELS: Record<PlatformTeamRole, string> = {
  owner: "Владелец платформы",
  admin: "Администратор",
  editor: "Редактор",
  support: "Поддержка",
  analyst: "Аналитик",
  finance: "Финансы",
};

function buildDisplayName(fullName: string | null, email: string | null): string {
  const trimmed = fullName?.trim();
  if (trimmed) {
    return trimmed;
  }

  const localPart = email?.split("@")[0]?.trim();
  return localPart || "Пользователь";
}

export function getPlatformTeamRoleLabel(role: PlatformTeamRole): string {
  return TEAM_ROLE_LABELS[role];
}

export async function getAdminUserDetail(
  userId: string,
): Promise<AdminUserDetail | null> {
  if (!isAdminExactUuid(userId)) {
    return null;
  }

  const service = createServiceRoleClient();

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error("admin_user_detail_load_failed");
  }

  if (!profile) {
    return null;
  }

  const [{ data: roleRows }, { data: memberships, error: membershipError }] =
    await Promise.all([
      service
        .from("platform_user_roles")
        .select("role_code")
        .eq("user_id", userId),
      service
        .from("author_members")
        .select(
          `
          role,
          author_id,
          authors!author_members_author_id_fkey (
            id,
            name,
            slug,
            access_status,
            can_bypass_product_moderation
          )
        `,
        )
        .eq("user_id", userId),
    ]);

  if (membershipError) {
    throw new Error("admin_user_detail_spaces_failed");
  }

  const assignedRoles: PlatformTeamRole[] = [];
  for (const row of roleRows ?? []) {
    const code = row.role_code;
    if (
      code === "owner" ||
      code === "admin" ||
      code === "editor" ||
      code === "support" ||
      code === "analyst" ||
      code === "finance"
    ) {
      assignedRoles.push(code);
    }
  }

  const teamRoles =
    assignedRoles.length > 0
      ? assignedRoles
      : legacyProfileRoleToTeamRoles(profile.role);

  const authorSpaces: AdminUserAuthorSpace[] = [];

  for (const row of memberships ?? []) {
    const author = Array.isArray(row.authors) ? row.authors[0] : row.authors;
    if (!author?.id) {
      continue;
    }

    const accessStatus = (author.access_status ?? "free") as AuthorAccessStatus;

    authorSpaces.push({
      authorId: author.id as string,
      name: (author.name as string) || "Автор",
      slug: (author.slug as string) || "",
      membershipRole: (row.role as string) || "—",
      accessStatus,
      accessStatusLabel: getAuthorAccessStatusLabel(accessStatus),
      canBypassProductModeration: author.can_bypass_product_moderation === true,
    });
  }

  authorSpaces.sort((left, right) => left.name.localeCompare(right.name, "ru"));

  const authorIds = authorSpaces.map((space) => space.authorId);
  const authorNameById = new Map(
    authorSpaces.map((space) => [space.authorId, space.name]),
  );

  let products: AdminUserAuthorProduct[] = [];

  if (authorIds.length > 0) {
    const { data: practiceRows, error: practiceError } = await service
      .from("practices")
      .select(
        "id, title, slug, product_kind, publication_class, format, status, moderation_status, updated_at, author_id",
      )
      .in("author_id", authorIds)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (practiceError) {
      throw new Error("admin_user_detail_products_failed");
    }

    products = (practiceRows ?? []).map((row) => ({
      id: row.id as string,
      title: (row.title as string) || "Без названия",
      slug: (row.slug as string) || "",
      productKind: (row.product_kind as string) || "practice",
      publicationClass: (row.publication_class as string | null) ?? null,
      format: (row.format as string | null) ?? null,
      status: (row.status as string) || "draft",
      moderationStatus: (row.moderation_status as string) || "not_submitted",
      updatedAt: (row.updated_at as string) || "",
      authorId: row.author_id as string,
      authorName: authorNameById.get(row.author_id as string) ?? "Автор",
    }));
  }

  return {
    id: profile.id as string,
    displayName: buildDisplayName(profile.full_name, profile.email),
    email: (profile.email as string | null) ?? null,
    profileRole: (profile.role as string) || "listener",
    profileRoleLabel: getLegacyProfileRoleLabel(profile.role),
    teamRoles,
    teamRoleLabels: teamRoles.map(getPlatformTeamRoleLabel),
    createdAt: (profile.created_at as string) || "",
    authorSpaces,
    products,
  };
}
