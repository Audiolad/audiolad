import { NextResponse } from "next/server";

import {
  assertAuthorContentMutationsAllowed,
  handleAuthorRouteError,
  requirePracticeAccess,
} from "@/lib/author-products/auth";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import {
  publishPracticeProduct,
  validatePublishRequirements,
} from "@/lib/author-products/publish";
import { registerPracticeLegacySlug } from "@/lib/products/lookup";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice, accessStatus } = await requirePracticeAccess(id);
    assertAuthorContentMutationsAllowed(accessStatus);
    const detail = await getAuthorProductDetail(supabase, id);

    if (!detail) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const validation = validatePublishRequirements(
      detail.practice,
      detail.audio_items,
      accessStatus,
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
    } catch (publishError) {
      if (
        publishError &&
        typeof publishError === "object" &&
        "code" in publishError &&
        "message" in publishError
      ) {
        const mapped = publishError as {
          code: string;
          message: string;
          status?: number;
        };

        console.error("author_publish_domain_error", id, mapped.code);

        return NextResponse.json(
          {
            error: mapped.code,
            message: mapped.message,
          },
          { status: mapped.status ?? 400 },
        );
      }

      console.error("author_publish_atomic_error", id);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    try {
      const { data: publishedPractice } = await supabase
        .from("practices")
        .select("slug")
        .eq("id", id)
        .maybeSingle();

      if (publishedPractice?.slug) {
        await registerPracticeLegacySlug(
          supabase,
          id,
          publishedPractice.slug as string,
        );
      }
    } catch {
      console.error("author_publish_legacy_slug_error", id);
    }

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({ product, message: "Аудиопродукт опубликован." });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
