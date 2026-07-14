import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeAccess,
} from "@/lib/author-products/auth";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import {
  syncPracticeAudioCompatibility,
  validatePublishRequirements,
} from "@/lib/author-products/publish";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice } = await requirePracticeAccess(id);
    const detail = await getAuthorProductDetail(supabase, id);

    if (!detail) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const validation = validatePublishRequirements(
      detail.practice,
      detail.audio_items,
    );

    if (!validation.ok) {
      return NextResponse.json(
        {
          error: validation.code,
          message: validation.message,
        },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const publishedAt = practice.published_at ?? now;

    const { error: practiceError } = await supabase
      .from("practices")
      .update({
        status: "published",
        published_at: publishedAt,
        updated_at: now,
      })
      .eq("id", id);

    if (practiceError) {
      console.error("author_publish_practice_error", practiceError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const audioItem = detail.audio_items[0];

    const { error: audioError } = await supabase
      .from("audio_items")
      .update({
        status: "published",
        updated_at: now,
      })
      .eq("id", audioItem.id);

    if (audioError) {
      console.error("author_publish_audio_error", audioError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    await syncPracticeAudioCompatibility(supabase, id);

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({ product, message: "Аудиопродукт опубликован." });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
