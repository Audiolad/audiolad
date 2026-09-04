import { NextResponse } from "next/server";

import { loadListenApiContext } from "@/lib/listen/api-context";
import {
  previewClipResponseHeaders,
  sliceBytesForRange,
} from "@/lib/listen/preview-clip-http";
import {
  buildPracticePreviewClip,
  type PreviewAudioItemRow,
} from "@/lib/listen/serve-preview-clip";

function clipErrorStatus(error: unknown): { status: number; code: string } {
  const code = error instanceof Error ? error.message : "preview_clip_failed";

  if (code === "audio_missing") {
    return { status: 404, code };
  }

  if (code === "preview_window_invalid" || code === "preview_clip_empty") {
    return { status: 422, code };
  }

  return { status: 500, code: "preview_clip_failed" };
}

export async function serveListenPreviewClip(
  request: Request,
  authorSlug: string,
  productSlug: string,
  audioId: string,
) {
  const loaded = await loadListenApiContext(request, authorSlug, productSlug, {
    purpose: "preview_audio",
  });

  if (!loaded.ok) {
    return loaded.response;
  }

  const { storageClient, practice, access } = loaded.context;

  if (access.mode !== "catalog_preview") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: audioItem, error: audioLookupError } = await storageClient
    .from("audio_items")
    .select(
      "id, audio_path, status, duration_seconds, preview_start_ms, preview_end_ms",
    )
    .eq("id", audioId)
    .eq("practice_id", practice.id)
    .maybeSingle();

  if (audioLookupError) {
    console.error("listen_preview_clip_item_error", audioLookupError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let item: PreviewAudioItemRow | null = audioItem;

  if (!item?.id && audioId === `legacy-${practice.id}`) {
    const { data: legacyPractice, error: legacyError } = await storageClient
      .from("practices")
      .select("audio_url")
      .eq("id", practice.id)
      .maybeSingle();

    if (legacyError) {
      console.error("listen_preview_clip_legacy_error", legacyError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    item = {
      id: audioId,
      audio_path: legacyPractice?.audio_url ?? null,
      status: "published",
      duration_seconds: null,
      preview_start_ms: null,
      preview_end_ms: null,
    };
  }

  if (!item?.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (item.status && item.status !== "published") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const clip = await buildPracticePreviewClip({
      storageClient,
      practiceId: practice.id,
      audioItem: item,
    });
    const rangeHeader = request.headers.get("range");
    const ranged = sliceBytesForRange(clip.bytes, rangeHeader);

    return new NextResponse(Buffer.from(ranged.body), {
      status: ranged.status,
      headers: previewClipResponseHeaders({
        contentLength: ranged.body.byteLength,
        contentRange: ranged.contentRange,
      }),
    });
  } catch (error) {
    const mapped = clipErrorStatus(error);
    console.error("listen_preview_clip_error", mapped.code);
    return NextResponse.json({ error: mapped.code }, { status: mapped.status });
  }
}
