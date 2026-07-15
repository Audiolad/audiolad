import { NextResponse } from "next/server";

import { serveListenSignedAudio } from "@/lib/listen/signed-audio";

type RouteContext = {
  params: Promise<{ slug: string; productSlug: string; audioId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug: authorSlug, productSlug, audioId } = await context.params;

    return await serveListenSignedAudio(
      request,
      authorSlug,
      productSlug,
      audioId,
    );
  } catch (error) {
    console.error("listen_audio_route_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
