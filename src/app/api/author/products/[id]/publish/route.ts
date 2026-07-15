import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeAccess,
} from "@/lib/author-products/auth";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import {
  publishPracticeProduct,
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

    try {
      await publishPracticeProduct(supabase, id, publishedAt);
    } catch {
      console.error("author_publish_atomic_error", id);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({ product, message: "Аудиопродукт опубликован." });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
