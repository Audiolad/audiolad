import { NextResponse } from "next/server";

import { serveListenPreviewClip } from "@/lib/listen/serve-preview-clip-response";
import { resolveLegacyPracticePath } from "@/lib/products/lookup";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type RouteContext = {
  params: Promise<{ slug: string; audioId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug, audioId } = await context.params;
    const supabase = await createClientFromRequest(request);
    const resolved = await resolveLegacyPracticePath(supabase, slug);

    if (!resolved) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return await serveListenPreviewClip(
      request,
      resolved.authorSlug,
      resolved.productSlug,
      audioId,
    );
  } catch (error) {
    console.error("listen_preview_clip_route_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
