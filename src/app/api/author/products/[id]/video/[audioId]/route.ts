import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  enqueueProductVideoRender,
  getProductVideoRenderStates,
} from "@/lib/product-video-export/server";
import { parseProductVideoOrientation } from "@/lib/product-video-export/contract";

type RouteContext = {
  params: Promise<{ id: string; audioId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id, audioId } = await context.params;
    const states = await getProductVideoRenderStates({
      practiceId: id,
      audioItemId: audioId,
    });
    return NextResponse.json(
      { states },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id, audioId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      orientation?: unknown;
    } | null;
    const orientation = parseProductVideoOrientation(body?.orientation);
    if (!orientation) {
      return NextResponse.json({ error: "invalid_orientation" }, { status: 400 });
    }

    const job = await enqueueProductVideoRender({
      practiceId: id,
      audioItemId: audioId,
      orientation,
    });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
