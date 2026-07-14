import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeAccess,
} from "@/lib/author-products/auth";

type RouteContext = {
  params: Promise<{ id: string; audioId: string }>;
};

const PREVIEW_EXPIRES_IN = 3600;

function normalizeSignedUrl(signedUrl: string): string | null {
  const trimmed = signedUrl.trim();

  if (!trimmed) {
    return null;
  }

  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://audiolad.ru";

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);

      if (url.origin === appOrigin) {
        return trimmed;
      }

      const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(
        /\/$/,
        "",
      );

      if (supabaseOrigin && url.origin === new URL(supabaseOrigin).origin) {
        return trimmed;
      }

      return trimmed;
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith("/storage/v1/")) {
    return `${appOrigin}${trimmed}`;
  }

  return null;
}

export async function GET(_request: Request, context: RouteContext) {
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
      console.error("author_audio_preview_lookup_error", audioLookupError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!audioItem?.id || !audioItem.audio_path?.trim()) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const { data, error: signedError } = await supabase.storage
      .from("practice-audio")
      .createSignedUrl(audioItem.audio_path, PREVIEW_EXPIRES_IN);

    if (signedError || !data?.signedUrl) {
      console.error("author_audio_preview_sign_error", signedError?.message);
      return NextResponse.json({ error: "preview_failed" }, { status: 500 });
    }

    const url = normalizeSignedUrl(data.signedUrl);

    if (!url) {
      return NextResponse.json({ error: "preview_failed" }, { status: 500 });
    }

    return NextResponse.json({
      url,
      expires_in: PREVIEW_EXPIRES_IN,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
