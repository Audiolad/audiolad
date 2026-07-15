import { NextResponse } from "next/server";

import { serveListenSignedAudio } from "@/lib/listen/signed-audio";
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

    return await serveListenSignedAudio(
      request,
      resolved.authorSlug,
      resolved.productSlug,
      audioId,
    );
  } catch (error) {
    console.error("listen_audio_route_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
