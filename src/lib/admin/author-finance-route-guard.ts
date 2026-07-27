import { NextResponse } from "next/server";

import {
  getPlatformAccess,
  snapshotHasPermission,
} from "@/lib/auth/platform-access";
import { createClient } from "@/lib/supabase/server";

export type AuthorFinanceRouteActor = { userId: string };

export type AuthorFinanceCapabilities = {
  canManageTerms: boolean;
  canManageLedger: boolean;
  canManageAdjustments: boolean;
  canViewPayouts: boolean;
  canCreatePayouts: boolean;
  canApprovePayouts: boolean;
  canMarkPayoutsPaid: boolean;
  canReversePayouts: boolean;
  canManagePayouts: boolean;
};

async function resolveActor(): Promise<
  | { ok: true; userId: string; capabilities: AuthorFinanceCapabilities }
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

  if (!snapshotHasPermission(access, "admin_panel.access")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    userId: user.id,
    capabilities: {
      canManageTerms: snapshotHasPermission(access, "finance.terms.manage"),
      canManageLedger: snapshotHasPermission(access, "finance.ledger.manage"),
      canManageAdjustments: snapshotHasPermission(
        access,
        "finance.adjustments.manage",
      ),
      canViewPayouts: snapshotHasPermission(access, "finance.payouts.view"),
      canCreatePayouts: snapshotHasPermission(access, "finance.payouts.create"),
      canApprovePayouts: snapshotHasPermission(
        access,
        "finance.payouts.approve",
      ),
      canMarkPayoutsPaid: snapshotHasPermission(
        access,
        "finance.payouts.mark_paid",
      ),
      canReversePayouts: snapshotHasPermission(
        access,
        "finance.payouts.reverse",
      ),
      canManagePayouts: snapshotHasPermission(access, "finance.payouts.manage"),
    },
  };
}

/**
 * Read-only author economy surfaces: finance and analytics viewers both see
 * them, but never any buyer identity (that is enforced in SQL).
 */
export async function requireAuthorFinanceViewActor(): Promise<
  | {
      ok: true;
      actor: AuthorFinanceRouteActor;
      capabilities: AuthorFinanceCapabilities;
    }
  | { ok: false; response: NextResponse }
> {
  const resolved = await resolveActor();
  if (!resolved.ok) return resolved;

  const supabase = await createClient();
  const access = await getPlatformAccess(supabase, resolved.userId);

  const canView =
    snapshotHasPermission(access, "finance.view") ||
    snapshotHasPermission(access, "analytics.view") ||
    resolved.capabilities.canManageTerms ||
    resolved.capabilities.canManageLedger ||
    resolved.capabilities.canViewPayouts;

  if (!canView) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    actor: { userId: resolved.userId },
    capabilities: resolved.capabilities,
  };
}

/** Write surfaces name the exact capability they need — no blanket finance role. */
export async function requireAuthorFinanceCapability(
  capability: keyof AuthorFinanceCapabilities,
): Promise<
  | {
      ok: true;
      actor: AuthorFinanceRouteActor;
      capabilities: AuthorFinanceCapabilities;
    }
  | { ok: false; response: NextResponse }
> {
  const resolved = await resolveActor();
  if (!resolved.ok) return resolved;

  if (!resolved.capabilities[capability]) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    actor: { userId: resolved.userId },
    capabilities: resolved.capabilities,
  };
}
