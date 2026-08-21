import { NextResponse } from "next/server";

import {
  getPlatformAccess,
  snapshotHasPermission,
} from "@/lib/auth/platform-access";
import { createClient } from "@/lib/supabase/server";

export type AdminSalesRouteActor = {
  userId: string;
};

export async function requireAdminSalesViewActor(): Promise<
  | { ok: true; actor: AdminSalesRouteActor }
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

  if (
    !snapshotHasPermission(access, "admin_panel.access") ||
    !snapshotHasPermission(access, "sales.view")
  ) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    actor: { userId: user.id },
  };
}
