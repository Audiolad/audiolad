import { NextResponse } from "next/server";

import { serveListenPreviewClip } from "@/lib/listen/serve-preview-clip-response";

type RouteContext = {
  params: Promise<{ slug: string; productSlug: string; audioId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug: authorSlug, productSlug, audioId } = await context.params;

    return await serveListenPreviewClip(
      request,
      authorSlug,
      productSlug,
      audioId,
    );
  } catch (error) {
    console.error("listen_preview_clip_route_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
