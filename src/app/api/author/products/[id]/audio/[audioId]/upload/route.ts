import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeAccess,
} from "@/lib/author-products/auth";
import {
  getMp3DurationSeconds,
  isAllowedMp3File,
  MAX_AUDIO_BYTES,
} from "@/lib/author-products/media";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import { syncSingleAudioCompatibility } from "@/lib/author-products/publish";
import { buildAudioItemStoragePath } from "@/lib/author-products/utils";

type RouteContext = {
  params: Promise<{ id: string; audioId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id, audioId } = await context.params;
    const { supabase } = await requirePracticeAccess(id);

    const { data: audioItem, error: audioLookupError } = await supabase
      .from("audio_items")
      .select("id, audio_path")
      .eq("id", audioId)
      .eq("practice_id", id)
      .maybeSingle();

    if (audioLookupError) {
      console.error("author_audio_upload_lookup_error", audioLookupError.message);
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

    if (!isAllowedMp3File(file)) {
      return NextResponse.json({ error: "invalid_file_type" }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "invalid_file_size" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const durationSeconds = await getMp3DurationSeconds(buffer);

    if (!durationSeconds) {
      return NextResponse.json({ error: "invalid_audio_duration" }, { status: 400 });
    }

    const storagePath = buildAudioItemStoragePath(id, audioId);

    if (audioItem.audio_path && audioItem.audio_path !== storagePath) {
      await supabase.storage.from("practice-audio").remove([audioItem.audio_path]);
    }

    const { error: uploadError } = await supabase.storage
      .from("practice-audio")
      .upload(storagePath, buffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("author_audio_upload_error", uploadError.message);
      return NextResponse.json({ error: "upload_failed" }, { status: 500 });
    }

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("audio_items")
      .update({
        audio_path: storagePath,
        duration_seconds: durationSeconds,
        updated_at: now,
      })
      .eq("id", audioId)
      .eq("practice_id", id);

    if (updateError) {
      console.error("author_audio_path_update_error", updateError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    await syncSingleAudioCompatibility(supabase, id);

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({
      product,
      duration_seconds: durationSeconds,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
