import { NextResponse } from "next/server";

import {
  validateAudioTitleLength,
} from "@/lib/author-products/limits";
import {
  handleAuthorRouteError,
  requirePracticeAccess,
} from "@/lib/author-products/auth";
import {
  AUDIO_ITEM_DETAIL_SELECT,
  getAuthorProductDetail,
} from "@/lib/author-products/products";
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

    const title =
      body &&
      typeof body === "object" &&
      "title" in body &&
      typeof body.title === "string"
        ? body.title.trim()
        : "";

    const { data: existingItems, error: existingError } = await supabase
      .from("audio_items")
      .select("position")
      .eq("practice_id", id)
      .order("position", { ascending: false })
      .limit(1);

    if (existingError) {
      console.error("author_audio_position_error", existingError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const nextPosition = (existingItems?.[0]?.position ?? 0) + 1;
    const resolvedTitle = title || `Аудио ${nextPosition}`;

    const titleError = validateAudioTitleLength(resolvedTitle);

    if (titleError) {
      return NextResponse.json({ error: titleError }, { status: 400 });
    }

    const { data: audioItem, error: insertError } = await supabase
      .from("audio_items")
      .insert({
        practice_id: id,
        title: resolvedTitle,
        position: nextPosition,
        status: "draft",
      })
      .select(AUDIO_ITEM_DETAIL_SELECT)
      .single();

    if (insertError || !audioItem?.id) {
      console.error("author_audio_create_error", insertError?.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    await syncSingleAudioCompatibility(supabase, id);

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({ product, audio_item: audioItem }, { status: 201 });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
