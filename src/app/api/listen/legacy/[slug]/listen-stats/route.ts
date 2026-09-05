import { NextResponse } from "next/server";

import { handleListenStatsGet, handleListenStatsPut } from "@/lib/listen/listen-stats-route";
import { resolveLegacyPracticePath } from "@/lib/products/lookup";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

async function resolveLegacySlugs(slug: string, request: Request) {
  const supabase = await createClientFromRequest(request);
  return resolveLegacyPracticePath(supabase, slug);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const resolved = await resolveLegacySlugs(slug, request);

    if (!resolved) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return await handleListenStatsGet(
      request,
      resolved.authorSlug,
      resolved.productSlug,
    );
  } catch (error) {
    console.error("listen_stats_legacy_get_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const resolved = await resolveLegacySlugs(slug, request);

    if (!resolved) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return await handleListenStatsPut(
      request,
      resolved.authorSlug,
      resolved.productSlug,
    );
  } catch (error) {
    console.error("listen_stats_legacy_put_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
