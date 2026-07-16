import { NextResponse } from "next/server";

import { loadListenSessionPayload } from "@/lib/listen/load-session-payload";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ slug: string; productSlug: string }>;
};

/**
 * GET listen session payload for Play All queue transitions.
 * Re-checks access. Never returns signed audio URLs or secrets.
 */
export async function GET(request: Request, context: RouteContext) {
  const { slug: authorSlug, productSlug } = await context.params;

  if (!authorSlug?.trim() || !productSlug?.trim()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const forceStartAtBeginning =
    url.searchParams.get("fromStart") === "1" ||
    url.searchParams.get("fromStart") === "true";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const loaded = await loadListenSessionPayload(
    supabase,
    authorSlug.trim(),
    productSlug.trim(),
    user?.id ?? null,
    { forceStartAtBeginning },
  );

  if (!loaded.ok) {
    const status =
      loaded.reason === "not_found"
        ? 404
        : loaded.reason === "error"
          ? 500
          : 403;

    return NextResponse.json(
      { ok: false, reason: loaded.reason },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    session: loaded.session,
  });
}
