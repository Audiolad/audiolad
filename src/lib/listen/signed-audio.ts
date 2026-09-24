import { NextResponse } from "next/server";

import { listCourseStorefrontPreviewAudioItemIds } from "@/lib/course-content/learner-assets";
import { isCourseStorefrontPreviewClipEligible } from "@/lib/course-content/storefront-preview";
import { isCoursePublication } from "@/lib/course-content/validators";
import { loadListenApiContext } from "@/lib/listen/api-context";
import { buildListenPreviewClipPath } from "@/lib/listen/preview-clip-http";
import { resolvePreviewClipWindow } from "@/lib/listen/serve-preview-clip";
import {
  signEntitledListenAudio,
  type SignEntitledListenAudioResult,
} from "@/lib/listen/sign-entitled-audio";
import {
  LISTEN_SIGNED_URL_TTL_SECONDS,
  normalizeStorageSignedUrl,
} from "@/lib/listen/signed-url";
import { buildListenApiBase } from "@/lib/products/paths";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  resolveMusicCatalogPreviewMode,
  resolveMusicListenSource,
  type MusicStreamCandidate,
} from "@/lib/listen/music-delivery";

function listenApiBaseFromRequest(
  request: Request,
  authorSlug: string,
  productSlug: string,
): string {
  try {
    const url = new URL(request.url);
    const prefix = url.pathname.replace(/\/audio\/[^/]+\/?$/, "");

    if (prefix.startsWith("/api/listen/")) {
      return prefix;
    }
  } catch {
    // Fall through to the product listen API base.
  }

  return buildListenApiBase(authorSlug, productSlug);
}


async function loadActiveMusicStream(
  audioItemId: string,
  activeAssetId: string | null | undefined,
): Promise<MusicStreamCandidate | null> {
  if (!activeAssetId) return null;
  const serviceRole = createServiceRoleClient();
  const { data, error } = await serviceRole
    .from("music_audio_assets")
    .select("id, audio_item_id, asset_role, lifecycle_state, storage_bucket, storage_path")
    .eq("id", activeAssetId)
    .maybeSingle();
  if (error) {
    console.error("listen_music_stream_lookup_error", error.message);
    return null;
  }
  if (!data || data.audio_item_id !== audioItemId) return null;
  return {
    audioItemId: data.audio_item_id,
    assetRole: data.asset_role,
    lifecycleState: data.lifecycle_state,
    storageBucket: data.storage_bucket,
    storagePath: data.storage_path,
  };
}

async function signListenStoragePath(
  bucket: string,
  path: string,
) {
  const serviceRole = createServiceRoleClient();
  const { data: signedData, error: signedError } = await serviceRole.storage
    .from(bucket)
    .createSignedUrl(path, LISTEN_SIGNED_URL_TTL_SECONDS);
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

function respondEntitledSignedAudio(result: SignEntitledListenAudioResult) {
  if (result.ok) {
    return NextResponse.json({
      url: result.url,
      expires_in: result.expiresIn,
    });
  }

  if (result.reason === "not_found" || result.reason === "audio_missing") {
    return NextResponse.json({ error: result.reason }, { status: 404 });
  }
  if (result.reason === "forbidden" || result.reason === "access_required") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (result.reason === "sign_failed") {
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}

export async function serveListenSignedAudio(
  request: Request,
  authorSlug: string,
  productSlug: string,
  audioId: string,
) {
  const wantsCatalogPreview =
    new URL(request.url).searchParams.get("preview") === "1";
  const loaded = await loadListenApiContext(
    request,
    authorSlug,
    productSlug,
    { purpose: wantsCatalogPreview ? "preview_audio" : "full_audio" },
  );

  if (!loaded.ok) {
    return loaded.response;
  }

  const { storageClient, practice, access, userId } = loaded.context;
  const isCourse = isCoursePublication(
    practice.publication_class,
    practice.product_kind,
  );

  if (isCourse && access.mode === "catalog_preview") {
    try {
      const serviceRole = createServiceRoleClient();
      const level1Ids = await listCourseStorefrontPreviewAudioItemIds({
        serviceRole,
        publicationId: practice.id,
      });
      const { data: courseAudio, error: courseAudioError } = await serviceRole
        .from("audio_items")
        .select(
          "id, practice_id, audio_path, status, duration_seconds, preview_start_ms, preview_end_ms",
        )
        .eq("id", audioId)
        .eq("practice_id", practice.id)
        .maybeSingle();

      if (courseAudioError) {
        console.error("listen_course_preview_item_error", courseAudioError.message);
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }

      const audioPath = courseAudio?.audio_path?.trim() ?? null;
      if (!courseAudio?.id || !audioPath || courseAudio.status !== "published") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }

      if (
        !isCourseStorefrontPreviewClipEligible(audioId, courseAudio, level1Ids)
      ) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }

      const window = resolvePreviewClipWindow(courseAudio);
      if (window.needsSetup || window.source !== "configured") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }

      const clipUrl = buildListenPreviewClipPath(
        listenApiBaseFromRequest(request, authorSlug, productSlug),
        audioId,
      );

      return NextResponse.json({
        url: clipUrl,
        expires_in: LISTEN_SIGNED_URL_TTL_SECONDS,
        preview_clip: true,
        preview_start_ms: window.startMs,
        preview_end_ms: window.endMs,
      });
    } catch (error) {
      console.error("listen_course_preview_access_error", error);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  }

  if (access.mode !== "catalog_preview") {
    return respondEntitledSignedAudio(
      await signEntitledListenAudio({
        userId,
        authorSlug,
        productSlug,
        audioId,
        practice,
      }),
    );
  }

  const { data: audioItem, error: audioLookupError } = await storageClient
    .from("audio_items")
    .select(
      "id, practice_id, audio_path, status, duration_seconds, preview_start_ms, preview_end_ms, active_music_delivery_asset_id",
    )
    .eq("id", audioId)
    .eq("practice_id", practice.id)
    .maybeSingle();

  if (audioLookupError) {
    console.error("listen_audio_item_error", audioLookupError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let audioPath: string | null = null;
  let audioStatus: string | null = null;
  let previewRow = audioItem;

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
    previewRow = {
      id: audioId,
      practice_id: practice.id,
      audio_path: audioPath,
      status: "published",
      duration_seconds: null,
      preview_start_ms: null,
      preview_end_ms: null,
      active_music_delivery_asset_id: null,
    };
  } else {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const activeStream = audioItem?.id
    ? await loadActiveMusicStream(
        audioItem.id,
        audioItem.active_music_delivery_asset_id,
      )
    : null;
  const listenSource = resolveMusicListenSource({
    productKind: practice.product_kind ?? "",
    audioItemId: audioId,
    audioPath,
    activeStream,
  });

  if (!audioPath && listenSource.kind === "missing") {
    return NextResponse.json({ error: "audio_missing" }, { status: 404 });
  }

  if (access.mode === "catalog_preview") {
    if (audioStatus !== "published") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const previewMode = resolveMusicCatalogPreviewMode({
      productKind: practice.product_kind ?? "",
      audioItemId: audioId,
      audioPath,
      activeStream,
    });
    if (previewMode === "clip") {
      const window = resolvePreviewClipWindow(previewRow ?? {});
      const clipUrl = buildListenPreviewClipPath(
        listenApiBaseFromRequest(request, authorSlug, productSlug),
        audioId,
      );
      return NextResponse.json({
        url: clipUrl,
        expires_in: LISTEN_SIGNED_URL_TTL_SECONDS,
        preview_clip: true,
        preview_start_ms: window.startMs,
        preview_end_ms: window.endMs,
      });
    }
    if (previewMode.kind === "missing") {
      return NextResponse.json({ error: "audio_missing" }, { status: 404 });
    }
    return signListenStoragePath(previewMode.bucket, previewMode.path);
  }

  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}
