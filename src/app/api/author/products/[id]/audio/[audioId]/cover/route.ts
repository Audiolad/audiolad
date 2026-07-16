import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeAccess,
} from "@/lib/author-products/auth";
import {
  getCoverExtension,
  MAX_COVER_BYTES,
} from "@/lib/author-products/media";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import {
  buildTrackCoverStoragePath,
  COVER_EXTENSIONS,
  getCoverPublicUrl,
  removeTrackCoverFiles,
} from "@/lib/author-products/utils";

type RouteContext = {
  params: Promise<{ id: string; audioId: string }>;
};

const SHARED_COVER_ENABLED_MESSAGE =
  "Сначала отключите использование общей обложки для всех треков.";

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, audioId } = await context.params;
    const { supabase } = await requirePracticeAccess(id);

    const { data: audioItem, error: lookupError } = await supabase
      .from("audio_items")
      .select("id")
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

    await removeTrackCoverFiles(supabase, id, audioId);

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("audio_items")
      .update({
        cover_url: null,
        updated_at: now,
      })
      .eq("id", audioId)
      .eq("practice_id", id);

    if (updateError) {
      console.error("author_track_cover_delete_error", updateError.message);
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
    const { supabase, practice } = await requirePracticeAccess(id);

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
      .select("id")
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

    const extension = getCoverExtension(file);

    if (!extension) {
      return NextResponse.json({ error: "invalid_file_type" }, { status: 400 });
    }

    const storagePath = buildTrackCoverStoragePath(id, audioId, extension);
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("practice-covers")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("author_track_cover_upload_error", uploadError.message);
      return NextResponse.json({ error: "upload_failed" }, { status: 500 });
    }

    for (const oldExtension of COVER_EXTENSIONS) {
      if (oldExtension === extension) {
        continue;
      }

      const oldPath = buildTrackCoverStoragePath(id, audioId, oldExtension);
      await supabase.storage.from("practice-covers").remove([oldPath]);
    }

    const coverUrl = getCoverPublicUrl(storagePath);
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("audio_items")
      .update({
        cover_url: coverUrl,
        updated_at: now,
      })
      .eq("id", audioId)
      .eq("practice_id", id);

    if (updateError) {
      console.error("author_track_cover_update_error", updateError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({ product, cover_url: coverUrl });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
