import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

import {
  legacyProfileRoleToTeamRoles,
  resolvePermissionsForRoles,
  rolesGrantPermission,
  type PlatformTeamRole,
} from "@/lib/auth/platform-permissions";
import { fetchUserPlatformRole } from "@/lib/auth/platform-role-lookup";

export type PlatformAccessSnapshot = {
  userId: string;
  roles: PlatformTeamRole[];
  permissions: ReadonlySet<string>;
  usedLegacyFallback: boolean;
};

type UserRoleRow = {
  role_code: string | null;
};

async function loadAssignedTeamRoles(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlatformTeamRole[]> {
  const { data, error } = await supabase
    .from("platform_user_roles")
    .select("role_code")
    .eq("user_id", userId);

  if (error) {
    // Table may not exist yet before migration; fall back to legacy only.
    if (
      error.code === "42P01" ||
      error.message?.includes("platform_user_roles") ||
      error.message?.includes("schema cache")
    ) {
      return [];
    }
    throw new Error("platform_user_roles_lookup_failed");
  }

  const roles: PlatformTeamRole[] = [];
  for (const row of (data as UserRoleRow[] | null) ?? []) {
    if (
      row.role_code === "owner" ||
      row.role_code === "admin" ||
      row.role_code === "editor" ||
      row.role_code === "support" ||
      row.role_code === "analyst" ||
      row.role_code === "finance"
    ) {
      roles.push(row.role_code);
    }
  }
  return roles;
}

/**
 * Loads platform team roles + effective permissions for a user.
 * Temporary legacy fallback: profiles.role platform_owner/admin when no RBAC rows.
 */
export async function loadPlatformAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlatformAccessSnapshot> {
  let roles = await loadAssignedTeamRoles(supabase, userId);
  let usedLegacyFallback = false;

  if (roles.length === 0) {
    const legacyRole = await fetchUserPlatformRole(supabase, userId);
    const legacyRoles = legacyProfileRoleToTeamRoles(legacyRole);
    if (legacyRoles.length > 0) {
      roles = legacyRoles;
      usedLegacyFallback = true;
    }
  }

  return {
    userId,
    roles,
    permissions: resolvePermissionsForRoles(roles),
    usedLegacyFallback,
  };
}

/** Request-scoped cache for RSC. */
export const getPlatformAccess = cache(
  async (
    supabase: SupabaseClient,
    userId: string,
  ): Promise<PlatformAccessSnapshot> => loadPlatformAccess(supabase, userId),
);

export async function hasPermission(
  supabase: SupabaseClient,
  userId: string,
  permission: string,
): Promise<boolean> {
  // Prefer DB function when available (owner bypass + legacy fallback in one place).
  const { data, error } = await supabase.rpc("has_platform_permission", {
    p_user_id: userId,
    p_permission_code: permission,
  });

  if (!error && typeof data === "boolean") {
    return data;
  }

  const access = await loadPlatformAccess(supabase, userId);
  if (access.roles.includes("owner")) {
    return true;
  }
  return access.permissions.has(permission);
}

export async function assertPermission(
  supabase: SupabaseClient,
  userId: string,
  permission: string,
): Promise<{ ok: true } | { ok: false; status: 403 | 500 }> {
  try {
    const allowed = await hasPermission(supabase, userId, permission);
    if (!allowed) {
      return { ok: false, status: 403 };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 500 };
  }
}

export function snapshotHasPermission(
  access: PlatformAccessSnapshot,
  permission: string,
): boolean {
  if (access.roles.includes("owner")) {
    return true;
  }
  return access.permissions.has(permission);
}

export function snapshotRolesGrantPermission(
  roles: readonly string[],
  permission: string,
): boolean {
  return rolesGrantPermission(roles, permission);
}
