import { NextResponse } from "next/server";

import { loadListenApiContext } from "@/lib/listen/api-context";
import {
  LISTEN_SIGNED_URL_TTL_SECONDS,
  normalizeStorageSignedUrl,
} from "@/lib/listen/signed-url";
import { canEntitledUserAccessPracticeStatus } from "@/lib/products/access";

export async function serveListenSignedAudio(
  request: Request,
  authorSlug: string,
  productSlug: string,
  audioId: string,
) {
  const loaded = await loadListenApiContext(request, authorSlug, productSlug);

  if (!loaded.ok) {
    return loaded.response;
  }

  const { storageClient, practice, access } = loaded.context;

  const { data: audioItem, error: audioLookupError } = await storageClient
    .from("audio_items")
    .select("id, practice_id, audio_path, status")
    .eq("id", audioId)
    .eq("practice_id", practice.id)
    .maybeSingle();

  if (audioLookupError) {
    console.error("listen_audio_item_error", audioLookupError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let audioPath: string | null = null;
  let audioStatus: string | null = null;

  if (audioItem?.id) {
    audioPath = audioItem.audio_path?.trim() ?? null;
    audioStatus = audioItem.status;
  } else if (audioId === `legacy-${practice.id}`) {
    const { data: legacyPractice, error: legacyError } = await storageClient
      .from("practices")
      .select("audio_url")
      .eq("id", practice.id)
      .maybeSingle();

    if (legacyError) {
      console.error("listen_audio_legacy_error", legacyError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    audioPath = legacyPractice?.audio_url?.trim() ?? null;
    audioStatus = "published";
  } else {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!audioPath) {
    return NextResponse.json({ error: "audio_missing" }, { status: 404 });
  }

  if (access.mode === "entitled") {
    if (!canEntitledUserAccessPracticeStatus(practice.status)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (audioStatus !== "published") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const { data: signedData, error: signedError } = await storageClient.storage
    .from("practice-audio")
    .createSignedUrl(audioPath, LISTEN_SIGNED_URL_TTL_SECONDS);

  if (signedError || !signedData?.signedUrl) {
    console.error("listen_audio_sign_error", signedError?.message);
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }

  const url = normalizeStorageSignedUrl(signedData.signedUrl);

  if (!url) {
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }

  return NextResponse.json({
    url,
    expires_in: LISTEN_SIGNED_URL_TTL_SECONDS,
  });
}
