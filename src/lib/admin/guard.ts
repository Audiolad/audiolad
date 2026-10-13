import { getVisibleAdminNavItems } from "@/lib/admin/nav";
import {
  getPlatformAccess,
  snapshotHasPermission,
  type PlatformAccessSnapshot,
} from "@/lib/auth/platform-access";
import type { PlatformPermission } from "@/lib/auth/platform-permissions";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
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

export const AI_COMPANY_PATH = "/admin/ai-company";

/**
 * Pure decision for the admin guards (unit-tested).
 * - panel: full admin panel (admin_panel.access).
 * - ai_company_only: no panel, but ai_company.view (read-only viewer role): only /admin/ai-company.
 * - none: hide the panel.
 */
export function adminAccessKind(access: PlatformAccessSnapshot): "panel" | "ai_company_only" | "none" {
  if (snapshotHasPermission(access, "admin_panel.access")) return "panel";
  if (snapshotHasPermission(access, "ai_company.view")) return "ai_company_only";
  return "none";
}

/** Only the platform owner session may act for Core actor `sergey` (launch / acceptance / lifecycle). */
export function isAiCompanyOwner(access: PlatformAccessSnapshot): boolean {
  return access.roles.includes("owner");
}

/**
 * Gate for /admin layout: the full panel, or the AI-company viewer (whose pages are then each guarded:
 * every other section calls requireAdminPanelAccess / requireAdminPermission and sends the viewer back to
 * /admin/ai-company).
 */
export async function requireAdminLayoutAccess(): Promise<AdminSession> {
  const session = await loadAdminSession();
  if (!session) {
    redirect("/auth/sign-in?next=/admin");
  }
  if (adminAccessKind(session.access) === "none") {
    notFound();
  }
  return session;
}

/**
 * Gate for a page of the full panel.
 * No admin_panel.access → notFound (hide panel existence); the AI-company viewer is sent to its only page.
 */
export async function requireAdminPanelAccess(): Promise<AdminSession> {
  const session = await loadAdminSession();

  if (!session) {
    redirect("/auth/sign-in?next=/admin");
  }

  const kind = adminAccessKind(session.access);
  if (kind === "ai_company_only") {
    redirect(AI_COMPANY_PATH);
  }
  if (kind !== "panel") {
    notFound();
  }

  return session;
}

/** Gate for /admin/ai-company (read): full panel with ai_company.view, or the viewer role. */
export async function requireAiCompanyView(): Promise<AdminSession> {
  const session = await loadAdminSession();
  if (!session) {
    redirect(`/auth/sign-in?next=${AI_COMPANY_PATH}`);
  }
  if (!snapshotHasPermission(session.access, "ai_company.view")) {
    if (adminAccessKind(session.access) === "none") notFound();
    forbidden();
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

/** 403 for a mutating AI-company endpoint called by a non-owner session (e.g. the read-only viewer). */
export function aiCompanyOwnerOnlyResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, code: "owner_required", message: "Только просмотр: менять задачи может только владелец платформы." },
    { status: 403 },
  );
}
