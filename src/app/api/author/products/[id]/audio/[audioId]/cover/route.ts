import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { MAX_COVER_BYTES } from "@/lib/author-products/media";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import {
  cleanupCoverManifestWithinPrefix,
  createPracticeImageWriteClient,
  PRACTICE_COVERS_BUCKET,
  trackCoverVariantPrefix,
  writeTrackCoverColumns,
} from "@/lib/author-products/cover-storage";
import { removeTrackCoverFiles } from "@/lib/author-products/utils";
import {
  primaryPublicUrl,
  uploadOptimizedImageSet,
} from "@/lib/images/image-upload-service";
import { parseImageManifest } from "@/lib/images/image-manifest";
import { imageProcessErrorMessage } from "@/lib/images/process-image";

type RouteContext = {
  params: Promise<{ id: string; audioId: string }>;
};

const SHARED_COVER_ENABLED_MESSAGE =
  "Сначала отключите использование общей обложки для всех треков.";

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, audioId } = await context.params;
    const { supabase } = await requirePracticeMutationAccess(id);

    const { data: audioItem, error: lookupError } = await supabase
      .from("audio_items")
      .select("id, cover_image")
      .eq("id", audioId)
      .eq("practice_id", id)
      .maybeSingle();

    if (lookupError) {
      console.error("author_track_cover_lookup_error", lookupError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!audioItem?.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Cover objects and cover columns are server-only (1:1 is enforced
    // here; migrations 20270117120000 and 20270118120000).
    const coverWriter = createPracticeImageWriteClient();

    if (audioItem.cover_image) {
      await cleanupCoverManifestWithinPrefix(
        coverWriter,
        parseImageManifest(audioItem.cover_image),
        trackCoverVariantPrefix(id, audioId),
      );
    }

    await removeTrackCoverFiles(coverWriter, id, audioId);

    const now = new Date().toISOString();

    const cleared = await writeTrackCoverColumns(coverWriter, id, audioId, {
      cover_url: null,
      cover_image: null,
      updated_at: now,
    });

    if (!cleared.ok) {
      console.error("author_track_cover_delete_error", cleared.error);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({ product, cover_url: null });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id, audioId } = await context.params;
    const { supabase, practice } = await requirePracticeMutationAccess(id);

    if (practice.use_shared_cover !== false) {
      return NextResponse.json(
        {
          error: "shared_cover_enabled",
          message: SHARED_COVER_ENABLED_MESSAGE,
        },
        { status: 409 },
      );
    }

    const { data: audioItem, error: lookupError } = await supabase
      .from("audio_items")
      .select("id, cover_image")
      .eq("id", audioId)
      .eq("practice_id", id)
      .maybeSingle();

    if (lookupError) {
      console.error("author_track_cover_lookup_error", lookupError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!audioItem?.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_COVER_BYTES) {
      return NextResponse.json({ error: "invalid_file_size" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const previousManifest = parseImageManifest(audioItem.cover_image);
    // Cover objects and cover columns are server-only (1:1 is enforced
    // here; migrations 20270117120000 and 20270118120000).
    const coverWriter = createPracticeImageWriteClient();

    const uploaded = await uploadOptimizedImageSet({
      profile: "track-cover",
      bucket: PRACTICE_COVERS_BUCKET,
      buffer,
      declaredMime: file.type,
      storage: coverWriter.storage,
      context: { practiceId: id, audioItemId: audioId },
    });

    if (!uploaded.ok) {
      return NextResponse.json(
        {
          error: uploaded.code,
          message: imageProcessErrorMessage(
            uploaded.code as "corrupt_image",
            "track-cover",
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

    const written = await writeTrackCoverColumns(coverWriter, id, audioId, {
      cover_url: coverUrl,
      cover_image: uploaded.data.manifest,
      updated_at: now,
    });

    if (!written.ok) {
      console.error("author_track_cover_update_error", written.error);
      await cleanupCoverManifestWithinPrefix(
        coverWriter,
        uploaded.data.manifest,
        trackCoverVariantPrefix(id, audioId),
      );
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (previousManifest) {
      await cleanupCoverManifestWithinPrefix(
        coverWriter,
        previousManifest,
        trackCoverVariantPrefix(id, audioId),
      );
    }

    await removeTrackCoverFiles(coverWriter, id, audioId);

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({
      product,
      cover_url: coverUrl,
      cover_image: uploaded.data.manifest,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
