import { getVisibleAdminNavItems } from "@/lib/admin/nav";
import {
  getPlatformAccess,
  snapshotHasPermission,
  type PlatformAccessSnapshot,
} from "@/lib/auth/platform-access";
import type { PlatformPermission } from "@/lib/auth/platform-permissions";
import { createClient } from "@/lib/supabase/server";
import { forbidden, notFound, redirect } from "next/navigation";

export type AdminSession = {
  userId: string;
  email: string | null;
  access: PlatformAccessSnapshot;
};

async function loadAdminSession(): Promise<AdminSession | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const access = await getPlatformAccess(supabase, user.id);

  return {
    userId: user.id,
    email: user.email ?? null,
    access,
  };
}

/**
 * Gate for /admin layout.
 * No admin_panel.access → notFound (hide panel existence).
 */
export async function requireAdminPanelAccess(): Promise<AdminSession> {
  const session = await loadAdminSession();

  if (!session) {
    redirect("/auth/sign-in?next=/admin");
  }

  if (!snapshotHasPermission(session.access, "admin_panel.access")) {
    notFound();
  }

  return session;
}

/**
 * Gate for a section inside the panel.
 * Caller must already have panel access (layout). Missing section permission → 403.
 */
export async function requireAdminPermission(
  permission: PlatformPermission,
): Promise<AdminSession> {
  const session = await requireAdminPanelAccess();

  if (!snapshotHasPermission(session.access, permission)) {
    forbidden();
  }

  return session;
}

/**
 * Require any of the listed permissions (OR).
 */
export async function requireAnyAdminPermission(
  permissions: readonly PlatformPermission[],
): Promise<AdminSession> {
  const session = await requireAdminPanelAccess();

  const allowed = permissions.some((permission) =>
    snapshotHasPermission(session.access, permission),
  );

  if (!allowed) {
    forbidden();
  }

  return session;
}

export function getFirstAllowedAdminPath(access: PlatformAccessSnapshot): string | null {
  const items = getVisibleAdminNavItems(access);
  return items[0]?.href ?? null;
}
