import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assertPermission,
  hasPermission,
  loadPlatformAccess,
} from "@/lib/auth/platform-access";
import { fetchUserPlatformRole as fetchLegacyPlatformRole } from "@/lib/auth/platform-role-lookup";

export const PLATFORM_OWNER_ROLE = "platform_owner" as const;
export const PLATFORM_ADMIN_ROLE = "platform_admin" as const;
export const LISTENER_ROLE = "listener" as const;

export type PlatformRole =
  | typeof PLATFORM_OWNER_ROLE
  | typeof PLATFORM_ADMIN_ROLE
  | typeof LISTENER_ROLE
  | string;

export { fetchUserPlatformRole } from "@/lib/auth/platform-role-lookup";

/**
 * @deprecated Prefer platform team roles (owner/admin/…) via platform-access.
 * Kept for legacy profiles.role values and user-deletion policy labels.
 */
export function isPlatformOwnerRole(role: string | null | undefined): boolean {
  return role === PLATFORM_OWNER_ROLE;
}

/**
 * @deprecated Prefer platform team roles via platform-access.
 */
export function isPlatformAdminRole(role: string | null | undefined): boolean {
  return role === PLATFORM_ADMIN_ROLE;
}

/**
 * @deprecated Prefer hasPermission(..., "admin_panel.access").
 * Temporary helper for legacy profiles.role strings only.
 */
export function isPlatformStaffRole(role: string | null | undefined): boolean {
  return isPlatformOwnerRole(role) || isPlatformAdminRole(role);
}

export function getPlatformRoleLabel(role: string | null | undefined): string {
  if (isPlatformOwnerRole(role)) {
    return "Владелец платформы";
  }

  if (isPlatformAdminRole(role)) {
    return "Администратор";
  }

  return "Слушатель";
}

/**
 * Elevated platform access for operational surfaces that previously
 * checked legacy staff. Maps to admin_panel.access via the RBAC layer.
 */
export async function isPlatformAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  return hasPermission(supabase, userId, "admin_panel.access");
}

export async function hasAdminPanelAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  return hasPermission(supabase, userId, "admin_panel.access");
}

export async function assertPlatformAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: 403 | 500 }> {
  return assertPermission(supabase, userId, "admin_panel.access");
}

export async function isPlatformOwner(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const access = await loadPlatformAccess(supabase, userId);
  if (access.roles.includes("owner")) {
    return true;
  }

  const legacy = await fetchLegacyPlatformRole(supabase, userId);
  return isPlatformOwnerRole(legacy);
}
