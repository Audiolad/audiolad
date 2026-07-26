import { NextResponse } from "next/server";

import { getPlatformAccess, snapshotHasPermission } from "@/lib/auth/platform-access";
import { createClient } from "@/lib/supabase/server";

export type RefundRouteActor = { userId: string };

/**
 * Refund surfaces require `refunds.manage` on top of admin panel access.
 * Owner bypasses through snapshotHasPermission.
 */
export async function requireRefundsManageActor(): Promise<
  { ok: true; actor: RefundRouteActor } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  const access = await getPlatformAccess(supabase, user.id);

  if (
    !snapshotHasPermission(access, "admin_panel.access") ||
    !snapshotHasPermission(access, "refunds.manage")
  ) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, actor: { userId: user.id } };
}

/** Read-only refund surfaces are also visible to finance viewers. */
export async function requireRefundsViewActor(): Promise<
  { ok: true; actor: RefundRouteActor; canManage: boolean }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  const access = await getPlatformAccess(supabase, user.id);
  const canManage = snapshotHasPermission(access, "refunds.manage");
  const canView =
    canManage ||
    snapshotHasPermission(access, "finance.view") ||
    snapshotHasPermission(access, "analytics.view");

  if (!snapshotHasPermission(access, "admin_panel.access") || !canView) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, actor: { userId: user.id }, canManage };
}
