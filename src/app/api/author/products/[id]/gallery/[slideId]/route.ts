import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import {
  assertAuthorProductGalleryEligible,
  deleteAuthorGallerySlide,
  getAuthorGalleryErrorMessage,
  isGalleryNotFoundError,
  isGalleryNotSupportedError,
  listAuthorGallerySlides,
  PRACTICE_COVERS_BUCKET,
  replaceAuthorGallerySlideImage,
} from "@/lib/author-products/gallery";
import { MAX_COVER_BYTES } from "@/lib/author-products/media";
import { assertPracticePublicContentEditableForActor } from "@/lib/author-products/moderation";
import {
  cleanupImageManifest,
  primaryPublicUrl,
  uploadOptimizedImageSet,
} from "@/lib/images/image-upload-service";
import { imageProcessErrorMessage } from "@/lib/images/process-image";
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

function galleryNotSupportedResponse() {
  return NextResponse.json(
    {
      error: "gallery_not_supported",
      message: getAuthorGalleryErrorMessage("gallery_not_supported"),
    },
    { status: 403 },
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id, slideId } = await context.params;
    const { supabase, practice, user } = await requirePracticeMutationAccess(id);
    assertAuthorProductGalleryEligible(practice);
    await assertPracticePublicContentEditableForActor(
      supabase,
      practice,
      user.id,
    );

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_COVER_BYTES) {
      return NextResponse.json(
        {
          error: "invalid_file_size",
          message: getAuthorGalleryErrorMessage("invalid_file_size"),
        },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadOptimizedImageSet({
      profile: "product-gallery",
      bucket: PRACTICE_COVERS_BUCKET,
      buffer,
      declaredMime: file.type,
      storage: supabase.storage,
      context: { practiceId: id, slideId },
    });

    if (!uploaded.ok) {
      return NextResponse.json(
        {
          error: uploaded.code,
          message: imageProcessErrorMessage(
            uploaded.code as "corrupt_image",
            "product-gallery",
          ),
        },
        { status: uploaded.code === "upload_failed" ? 500 : 400 },
      );
    }

    const now = new Date().toISOString();
    const imageUrl = primaryPublicUrl(
      PRACTICE_COVERS_BUCKET,
      uploaded.data,
      now,
    );

    try {
      const slide = await replaceAuthorGallerySlideImage(supabase, id, slideId, {
        imageUrl,
        imageManifest: uploaded.data.manifest,
      });
      const slides = await listAuthorGallerySlides(supabase, id);
      await schedulePublishedGalleryIndexNow(supabase, practice);

      return NextResponse.json({ slide, slides });
    } catch (error) {
      await cleanupImageManifest(
        supabase.storage,
        PRACTICE_COVERS_BUCKET,
        uploaded.data.manifest,
      );

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
    if (isGalleryNotSupportedError(error)) {
      return galleryNotSupportedResponse();
    }

    return handleAuthorRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, slideId } = await context.params;
    const { supabase, practice, user } = await requirePracticeMutationAccess(id);
    assertAuthorProductGalleryEligible(practice);
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
    if (isGalleryNotSupportedError(error)) {
      return galleryNotSupportedResponse();
    }

    return handleAuthorRouteError(error);
  }
}
