import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import {
  deleteAuthorGallerySlide,
  getAuthorGalleryErrorMessage,
  isGalleryNotFoundError,
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
  params: Promise<{ id: string; slideId: string }>;
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

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, slideId } = await context.params;
    const { supabase, practice, user } = await requirePracticeMutationAccess(id);
    await assertPracticePublicContentEditableForActor(
      supabase,
      practice,
      user.id,
    );

    try {
      const slides = await deleteAuthorGallerySlide(supabase, id, slideId);
      await schedulePublishedGalleryIndexNow(supabase, practice);
      return NextResponse.json({ slides });
    } catch (error) {
      if (isGalleryNotFoundError(error)) {
        return NextResponse.json(
          {
            error: error.code,
            message: getAuthorGalleryErrorMessage(error.code),
          },
          { status: error.status },
        );
      }

      throw error;
    }
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
