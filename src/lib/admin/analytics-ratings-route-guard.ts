import { NextResponse } from "next/server";

import { evaluateRatingsListenersAccess } from "@/lib/admin/analytics-ratings-listeners";
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

/**
 * «Оценки → Слушатели» shows listener e-mail / name, so it additionally
 * requires users.view on top of analytics.view (analyst alone is refused).
 */
export async function requireRatingsListenersViewActor(): Promise<
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
  const decision = evaluateRatingsListenersAccess({
    userId: user.id,
    hasPermission: (permission) => snapshotHasPermission(access, permission),
  });

  if (!decision.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: decision.error }, { status: decision.status }),
    };
  }

  return { ok: true, actor: { userId: user.id } };
}
