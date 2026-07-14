import { NextResponse } from "next/server";

import { resolveListenAccess } from "@/lib/listen/access";
import {
  listPracticeProgress,
  resetPracticeProgress,
  upsertPracticeProgress,
} from "@/lib/listen/progress";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

async function loadPracticeForUser(slug: string, request: Request) {
  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .select("id, author_id, status")
    .eq("slug", slug)
    .maybeSingle();

  if (practiceError) {
    console.error("listen_progress_practice_error", practiceError.message);
    return {
      error: NextResponse.json({ error: "internal_error" }, { status: 500 }),
    };
  }

  if (!practice?.id) {
    return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  }

  const access = await resolveListenAccess(supabase, user.id, practice);

  if (!access) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return { supabase, user, practice, access };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const loaded = await loadPracticeForUser(slug, request);

    if ("error" in loaded && loaded.error) {
      return loaded.error;
    }

    const { supabase, user, practice } = loaded;
    const progress = await listPracticeProgress(supabase, user.id, practice.id);

    return NextResponse.json({ progress });
  } catch (error) {
    console.error("listen_progress_get_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const loaded = await loadPracticeForUser(slug, request);

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

    const { supabase, user, practice } = loaded;

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

    if (loaded.access.mode === "entitled") {
      if (practice.status !== "published" || audioItem.status !== "published") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }

    await upsertPracticeProgress(
      supabase,
      user.id,
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
    const loaded = await loadPracticeForUser(slug, request);

    if ("error" in loaded && loaded.error) {
      return loaded.error;
    }

    const { supabase, user, practice } = loaded;

    await resetPracticeProgress(supabase, user.id, practice.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("listen_progress_delete_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
