import { NextResponse } from "next/server";

import { getPlatformAccess, snapshotHasPermission } from "@/lib/auth/platform-access";
import { createClient } from "@/lib/supabase/server";

export type RatingsAnalyticsActor = { userId: string };

/**
 * Ratings admin surfaces reuse analytics.view (read). Analysts may open the
 * tab. Mutations that change public aggregates are out of this stage.
 */
export async function requireRatingsAnalyticsViewActor(): Promise<
  { ok: true; actor: RatingsAnalyticsActor } | { ok: false; response: NextResponse }
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
    !snapshotHasPermission(access, "analytics.view")
  ) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, actor: { userId: user.id } };
}
