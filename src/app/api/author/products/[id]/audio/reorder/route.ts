import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import { reorderAudioItems } from "@/lib/author-products/reorder-audio-items";
import { syncPracticeAudioCompatibility } from "@/lib/author-products/publish";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeMutationAccess(id);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (
      !body ||
      typeof body !== "object" ||
      !("order" in body) ||
      !Array.isArray(body.order)
    ) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const order = body.order.filter((item): item is string => typeof item === "string");

    const reorderResult = await reorderAudioItems(supabase, id, order);

    if (!reorderResult.ok) {
      if (reorderResult.code === "invalid_request") {
        return NextResponse.json({ error: "invalid_request" }, { status: 400 });
      }

      console.error("author_audio_reorder_error", reorderResult.code);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    await syncPracticeAudioCompatibility(supabase, id);

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({ product });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
