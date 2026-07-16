import type { SupabaseClient } from "@supabase/supabase-js";

export const PLATFORM_OWNER_ROLE = "platform_owner" as const;
export const PLATFORM_ADMIN_ROLE = "platform_admin" as const;
export const LISTENER_ROLE = "listener" as const;

export type PlatformRole =
  | typeof PLATFORM_OWNER_ROLE
  | typeof PLATFORM_ADMIN_ROLE
  | typeof LISTENER_ROLE
  | string;

export function isPlatformOwnerRole(role: string | null | undefined): boolean {
  return role === PLATFORM_OWNER_ROLE;
}

export function isPlatformAdminRole(role: string | null | undefined): boolean {
  return role === PLATFORM_ADMIN_ROLE;
}

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

export async function fetchUserPlatformRole(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("platform_role_lookup_failed");
  }

  return typeof data?.role === "string" ? data.role : null;
}

export async function isPlatformAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const role = await fetchUserPlatformRole(supabase, userId);
  return isPlatformStaffRole(role);
}

export async function hasAdminPanelAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const role = await fetchUserPlatformRole(supabase, userId);
  return isPlatformStaffRole(role);
}

export async function assertPlatformAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: 403 | 500 }> {
  try {
    const admin = await isPlatformAdmin(supabase, userId);

    if (!admin) {
      return { ok: false, status: 403 };
    }

    return { ok: true };
  } catch {
    return { ok: false, status: 500 };
  }
}
