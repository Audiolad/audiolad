import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeAccess,
} from "@/lib/author-products/auth";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import { syncSingleAudioCompatibility } from "@/lib/author-products/publish";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeAccess(id);

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

    const { data: audioItems, error: lookupError } = await supabase
      .from("audio_items")
      .select("id")
      .eq("practice_id", id);

    if (lookupError) {
      console.error("author_audio_reorder_lookup_error", lookupError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const existingIds = new Set((audioItems ?? []).map((item) => item.id));

    if (order.length !== existingIds.size) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    for (const audioId of order) {
      if (!existingIds.has(audioId)) {
        return NextResponse.json({ error: "invalid_request" }, { status: 400 });
      }
    }

    const now = new Date().toISOString();

    for (const [index, audioId] of order.entries()) {
      const { error } = await supabase
        .from("audio_items")
        .update({
          position: index + 1,
          updated_at: now,
        })
        .eq("id", audioId)
        .eq("practice_id", id);

      if (error) {
        console.error("author_audio_reorder_error", error.message);
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
    }

    await syncSingleAudioCompatibility(supabase, id);

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({ product });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
