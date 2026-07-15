import { NextResponse } from "next/server";

import { loadListenApiContext } from "@/lib/listen/api-context";
import {
  listPracticeProgress,
  resetPracticeProgress,
  upsertPracticeProgress,
} from "@/lib/listen/progress";
import { resolveLegacyPracticePath } from "@/lib/products/lookup";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

async function loadLegacyListenContext(slug: string, request: Request) {
  const supabase = await createClientFromRequest(request);
  const resolved = await resolveLegacyPracticePath(supabase, slug);

  if (!resolved) {
    return {
      error: NextResponse.json({ error: "not_found" }, { status: 404 }),
    };
  }

  const loaded = await loadListenApiContext(
    request,
    resolved.authorSlug,
    resolved.productSlug,
  );

  if (!loaded.ok) {
    return { error: loaded.response };
  }

  return { context: loaded.context };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const loaded = await loadLegacyListenContext(slug, request);

    if ("error" in loaded && loaded.error) {
      return loaded.error;
    }

    const { supabase, userId, practice } = loaded.context!;

    if (!userId) {
      return NextResponse.json({ progress: [] });
    }

    const progress = await listPracticeProgress(supabase, userId, practice.id);

    return NextResponse.json({ progress });
  } catch (error) {
    console.error("listen_progress_get_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const loaded = await loadLegacyListenContext(slug, request);

    if ("error" in loaded && loaded.error) {
      return loaded.error;
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const audioItemId =
      "audio_item_id" in body && typeof body.audio_item_id === "string"
        ? body.audio_item_id.trim()
        : "";
    const positionSeconds =
      "position_seconds" in body && typeof body.position_seconds === "number"
        ? body.position_seconds
        : null;
    const completed =
      "completed" in body && typeof body.completed === "boolean"
        ? body.completed
        : false;

    if (!audioItemId || positionSeconds === null || positionSeconds < 0) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase, userId, practice, access } = loaded.context!;

    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: audioItem, error: audioError } = await supabase
      .from("audio_items")
      .select("id, status")
      .eq("id", audioItemId)
      .eq("practice_id", practice.id)
      .maybeSingle();

    if (audioError) {
      console.error("listen_progress_audio_error", audioError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!audioItem?.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (access.mode === "entitled") {
      if (practice.status !== "published" || audioItem.status !== "published") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }

    await upsertPracticeProgress(
      supabase,
      userId,
      practice.id,
      audioItemId,
      positionSeconds,
      completed,
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("listen_progress_put_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const loaded = await loadLegacyListenContext(slug, request);

    if ("error" in loaded && loaded.error) {
      return loaded.error;
    }

    const { supabase, userId, practice } = loaded.context!;

    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    await resetPracticeProgress(supabase, userId, practice.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("listen_progress_delete_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
