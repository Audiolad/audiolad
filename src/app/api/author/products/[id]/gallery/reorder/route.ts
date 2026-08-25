import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import {
  assertAuthorProductGalleryEligible,
  getAuthorGalleryErrorMessage,
  isGalleryNotSupportedError,
  isGalleryReorderError,
  reorderAuthorGallerySlides,
  type GalleryReorderSlideInput,
} from "@/lib/author-products/gallery";
import { assertPracticePublicContentEditableForActor } from "@/lib/author-products/moderation";
import { buildPracticeCanonicalUrl } from "@/lib/products/paths";
import {
  loadAuthorSlug,
  scheduleIndexNowNotification,
} from "@/lib/seo/indexnow/hooks";
import { INDEXNOW_REASONS } from "@/lib/seo/indexnow/reasons";
import type { SupabaseClient } from "@supabase/supabase-js";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function schedulePublishedGalleryIndexNow(
  supabase: SupabaseClient,
  practice: { author_id: string; status: string; slug: string },
) {
  if (practice.status !== "published" || !practice.slug) {
    return;
  }

  const authorSlug = await loadAuthorSlug(supabase, practice.author_id);

  if (!authorSlug) {
    return;
  }

  scheduleIndexNowNotification(
    [buildPracticeCanonicalUrl(authorSlug, practice.slug)],
    INDEXNOW_REASONS.practice_updated,
  );
}

function parseReorderSlides(body: unknown): GalleryReorderSlideInput[] | null {
  if (!body || typeof body !== "object" || !("slides" in body)) {
    return null;
  }

  const rawSlides = (body as { slides?: unknown }).slides;

  if (!Array.isArray(rawSlides)) {
    return null;
  }

  const slides: GalleryReorderSlideInput[] = [];

  for (const item of rawSlides) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const id = "id" in item && typeof item.id === "string" ? item.id : "";
    const position =
      "position" in item && typeof item.position === "number"
        ? item.position
        : Number.NaN;

    if (!id || !Number.isInteger(position)) {
      return null;
    }

    slides.push({ id, position });
  }

  return slides;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice, user } = await requirePracticeMutationAccess(id);
    assertAuthorProductGalleryEligible(practice);
    await assertPracticePublicContentEditableForActor(
      supabase,
      practice,
      user.id,
    );

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const slides = parseReorderSlides(body);

    if (!slides) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    try {
      const nextSlides = await reorderAuthorGallerySlides(supabase, id, slides);
      await schedulePublishedGalleryIndexNow(supabase, practice);
      return NextResponse.json({ slides: nextSlides });
    } catch (error) {
      if (isGalleryReorderError(error)) {
        return NextResponse.json(
          { error: error.code },
          { status: error.status },
        );
      }

      throw error;
    }
  } catch (error) {
    if (isGalleryNotSupportedError(error)) {
      return NextResponse.json(
        {
          error: "gallery_not_supported",
          message: getAuthorGalleryErrorMessage("gallery_not_supported"),
        },
        { status: 403 },
      );
    }

    return handleAuthorRouteError(error);
  }
}
