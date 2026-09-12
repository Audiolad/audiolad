import { NextResponse } from "next/server";

import {
  previewClipResponseHeaders,
  sliceBytesForRange,
} from "@/lib/listen/preview-clip-http";
import {
  clipErrorStatus,
  createSupabaseStudioMusicPreviewStore,
  handleStudioMusicPreview,
  studioMusicPreviewJsonContainsForbiddenFields,
} from "@/lib/studio-music/preview";
import { studioRouteError } from "@/lib/studio/server/route-errors";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "no-referrer");
  return NextResponse.json(body, { ...init, headers });
}

async function handleError(error: unknown) {
  const mapped = clipErrorStatus(error);
  if (mapped.code !== "preview_clip_failed") {
    return noStoreJson({ error: mapped.code }, { status: mapped.status });
  }
  const response = studioRouteError(error, "studio_music_preview_route_error");
  return noStoreJson(await response.json(), { status: response.status });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const result = await handleStudioMusicPreview({
      publicationId: searchParams.get("publicationId"),
      audioItemId: searchParams.get("audioItemId"),
      userId: user?.id ?? null,
      rangeHeader: request.headers.get("range"),
      store: createSupabaseStudioMusicPreviewStore(createServiceRoleClient()),
    });

    if (result.type === "full") {
      return result.response;
    }

    if (result.type === "json") {
      if (studioMusicPreviewJsonContainsForbiddenFields(result.body)) {
        return noStoreJson({ error: "internal_error" }, { status: 500 });
      }
      return noStoreJson(result.body, { status: result.status });
    }

    const ranged = sliceBytesForRange(
      result.bytes,
      request.headers.get("range"),
    );
    const headers = previewClipResponseHeaders({
      contentLength: ranged.body.byteLength,
      contentRange: ranged.contentRange,
    });
    headers.set("Referrer-Policy", "no-referrer");

    return new NextResponse(Buffer.from(ranged.body), {
      status: ranged.status,
      headers,
    });
  } catch (error) {
    return await handleError(error);
  }
}
