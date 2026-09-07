import { NextResponse } from "next/server";

import {
  canPlayCourseAudioItem,
  listCourseStorefrontPreviewAudioItemIds,
} from "@/lib/course-content/learner-assets";
import { isCourseStorefrontPreviewClipEligible } from "@/lib/course-content/storefront-preview";
import { isCoursePublication } from "@/lib/course-content/validators";
import { loadListenApiContext } from "@/lib/listen/api-context";
import { shouldEnforcePublishedAudioItemForEntitledSignedUrl } from "@/lib/listen/course-audio-status";
import { buildListenPreviewClipPath } from "@/lib/listen/preview-clip-http";
import { resolvePreviewClipWindow } from "@/lib/listen/serve-preview-clip";
import {
  LISTEN_SIGNED_URL_TTL_SECONDS,
  normalizeStorageSignedUrl,
} from "@/lib/listen/signed-url";
import { canEntitledUserAccessPracticeStatus } from "@/lib/products/access";
import { buildListenApiBase } from "@/lib/products/paths";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

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

  const { storageClient, supabase, practice, access, userId } = loaded.context;
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

  if (isCourse) {
    try {
      const serviceRole = createServiceRoleClient();
      const playable = await canPlayCourseAudioItem({
        supabase,
        serviceRole,
        practice,
        userId,
        audioItemId: audioId,
      });

      if (!playable) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }

      const { data: courseAudio, error: courseAudioError } = await serviceRole
        .from("audio_items")
        .select(
          "id, practice_id, audio_path, status, duration_seconds, preview_start_ms, preview_end_ms",
        )
        .eq("id", audioId)
        .eq("practice_id", practice.id)
        .maybeSingle();

      if (courseAudioError) {
        console.error("listen_course_audio_item_error", courseAudioError.message);
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }

      const audioPath = courseAudio?.audio_path?.trim() ?? null;
      if (!courseAudio?.id || !audioPath) {
        return NextResponse.json(
          { error: courseAudio?.id ? "audio_missing" : "not_found" },
          { status: 404 },
        );
      }

      const { data: signedData, error: signedError } = await serviceRole.storage
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
    } catch (error) {
      console.error("listen_course_audio_access_error", error);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  }

  const { data: audioItem, error: audioLookupError } = await storageClient
    .from("audio_items")
    .select(
      "id, practice_id, audio_path, status, duration_seconds, preview_start_ms, preview_end_ms",
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
    };
  } else {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!audioPath) {
    return NextResponse.json({ error: "audio_missing" }, { status: 404 });
  }

  if (access.mode === "catalog_preview") {
    if (audioStatus !== "published") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

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

  if (
    access.mode === "entitled" &&
    shouldEnforcePublishedAudioItemForEntitledSignedUrl(isCourse)
  ) {
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
