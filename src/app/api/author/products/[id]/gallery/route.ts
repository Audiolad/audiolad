import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeAccess,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import {
  getAuthorGalleryErrorMessage,
  insertAuthorGallerySlide,
  isGalleryLimitError,
  isGalleryReorderError,
  listAuthorGallerySlides,
  PRACTICE_COVERS_BUCKET,
  reorderAuthorGallerySlides,
} from "@/lib/author-products/gallery";
import { MAX_COVER_BYTES } from "@/lib/author-products/media";
import { assertPracticePublicContentEditableForActor } from "@/lib/author-products/moderation";
import { CATALOG_GALLERY_MAX_SLIDES } from "@/lib/catalog/gallery";
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

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeAccess(id);
    const slides = await listAuthorGallerySlides(supabase, id);

    return NextResponse.json({ slides });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice, user } = await requirePracticeMutationAccess(id);
    await assertPracticePublicContentEditableForActor(
      supabase,
      practice,
      user.id,
    );

    const formData = await request.formData();
    const file = formData.get("file");
    const rawAlt = formData.get("alt");
    const alt =
      typeof rawAlt === "string" && rawAlt.trim() ? rawAlt.trim() : null;

    if (alt && alt.length > 200) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

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

    const currentCount = (await listAuthorGallerySlides(supabase, id)).length;

    if (currentCount >= CATALOG_GALLERY_MAX_SLIDES) {
      return NextResponse.json(
        {
          error: "gallery_limit_exceeded",
          message: getAuthorGalleryErrorMessage("gallery_limit_exceeded"),
        },
        { status: 400 },
      );
    }

    const slideId = randomUUID();
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
      const slide = await insertAuthorGallerySlide(supabase, {
        id: slideId,
        publicationId: id,
        imageUrl,
        imageManifest: uploaded.data.manifest,
        alt,
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

      if (isGalleryLimitError(error)) {
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

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice, user } = await requirePracticeMutationAccess(id);
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

    if (
      !body ||
      typeof body !== "object" ||
      !("order" in body) ||
      !Array.isArray(body.order)
    ) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const order = body.order.filter(
      (item): item is string => typeof item === "string",
    );

    try {
      const slides = await reorderAuthorGallerySlides(supabase, id, order);
      await schedulePublishedGalleryIndexNow(supabase, practice);
      return NextResponse.json({ slides });
    } catch (error) {
      if (isGalleryReorderError(error)) {
        return NextResponse.json({ error: error.code }, { status: error.status });
      }

      throw error;
    }
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
