import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { assertPracticePublicContentEditable } from "@/lib/author-products/moderation";
import { MAX_COVER_BYTES } from "@/lib/author-products/media";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import { removePracticeCoverFiles } from "@/lib/author-products/utils";
import {
  cleanupImageManifest,
  primaryPublicUrl,
  uploadOptimizedImageSet,
} from "@/lib/images/image-upload-service";
import { imageProcessErrorMessage } from "@/lib/images/process-image";
import { parseImageManifest } from "@/lib/images/image-manifest";
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

const PRACTICE_COVERS_BUCKET = "practice-covers";

async function schedulePublishedCoverIndexNow(
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
    const { id } = await context.params;
    const { supabase, practice } = await requirePracticeMutationAccess(id);
    assertPracticePublicContentEditable(practice);

    const { data: existing } = await supabase
      .from("practices")
      .select("cover_image")
      .eq("id", id)
      .maybeSingle();

    await removePracticeCoverFiles(supabase, id);

    if (existing?.cover_image) {
      await cleanupImageManifest(
        supabase.storage,
        PRACTICE_COVERS_BUCKET,
        parseImageManifest(existing.cover_image),
      );
    }

    const { error: updateError } = await supabase
      .from("practices")
      .update({
        cover_url: null,
        cover_image: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("author_cover_delete_error", updateError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const product = await getAuthorProductDetail(supabase, id);
    await schedulePublishedCoverIndexNow(supabase, practice);

    return NextResponse.json({ product, cover_url: null });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice } = await requirePracticeMutationAccess(id);
    assertPracticePublicContentEditable(practice);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_COVER_BYTES) {
      return NextResponse.json({ error: "invalid_file_size" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const { data: previousRow } = await supabase
      .from("practices")
      .select("cover_image")
      .eq("id", id)
      .maybeSingle();

    const previousManifest = parseImageManifest(previousRow?.cover_image);

    const uploaded = await uploadOptimizedImageSet({
      profile: "product-cover",
      bucket: PRACTICE_COVERS_BUCKET,
      buffer,
      declaredMime: file.type,
      storage: supabase.storage,
      context: { practiceId: id },
    });

    if (!uploaded.ok) {
      return NextResponse.json(
        {
          error: uploaded.code,
          message: imageProcessErrorMessage(
            uploaded.code as "corrupt_image",
            "product-cover",
          ),
        },
        { status: uploaded.code === "upload_failed" ? 500 : 400 },
      );
    }

    const now = new Date().toISOString();
    const coverUrl = primaryPublicUrl(
      PRACTICE_COVERS_BUCKET,
      uploaded.data,
      now,
    );

    const { error: updateError } = await supabase
      .from("practices")
      .update({
        cover_url: coverUrl,
        cover_image: uploaded.data.manifest,
        updated_at: now,
      })
      .eq("id", id);

    if (updateError) {
      console.error("author_cover_update_error", updateError.message);
      await cleanupImageManifest(
        supabase.storage,
        PRACTICE_COVERS_BUCKET,
        uploaded.data.manifest,
      );
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (previousManifest) {
      await cleanupImageManifest(
        supabase.storage,
        PRACTICE_COVERS_BUCKET,
        previousManifest,
      );
    }

    await removePracticeCoverFiles(supabase, id);

    const product = await getAuthorProductDetail(supabase, id);
    await schedulePublishedCoverIndexNow(supabase, practice);

    return NextResponse.json({
      product,
      cover_url: coverUrl,
      cover_image: uploaded.data.manifest,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
