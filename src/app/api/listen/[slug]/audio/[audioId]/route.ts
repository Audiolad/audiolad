import { NextResponse } from "next/server";

import { resolveListenAccess } from "@/lib/listen/access";
import {
  LISTEN_SIGNED_URL_TTL_SECONDS,
  normalizeStorageSignedUrl,
} from "@/lib/listen/signed-url";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type RouteContext = {
  params: Promise<{ slug: string; audioId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug, audioId } = await context.params;
    const supabase = await createClientFromRequest(request);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: practice, error: practiceError } = await supabase
      .from("practices")
      .select("id, author_id, status")
      .eq("slug", slug)
      .maybeSingle();

    if (practiceError) {
      console.error("listen_audio_practice_error", practiceError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!practice?.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const access = await resolveListenAccess(supabase, user.id, practice);

    if (!access) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { data: audioItem, error: audioLookupError } = await supabase
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
      const { data: legacyPractice, error: legacyError } = await supabase
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
      if (practice.status !== "published") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }

      if (audioStatus !== "published") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }

    const { data: signedData, error: signedError } = await supabase.storage
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
    console.error("listen_audio_route_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
