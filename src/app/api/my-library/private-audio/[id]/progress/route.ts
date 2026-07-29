import { NextResponse } from "next/server";

import { requirePrivateAudioUser } from "@/lib/private-audio/server/access";
import {
  handlePrivateAudioRouteError,
  PrivateAudioApiError,
  privateNoStoreHeaders,
} from "@/lib/private-audio/server/errors";
import {
  getOwnedPrivateAudioItem,
  getPrivateAudioProgress,
  savePrivateAudioProgress,
} from "@/lib/private-audio/server/repository";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const supabase = await createClient();
    const user = await requirePrivateAudioUser(supabase);
    const { id } = await context.params;
    const item = await getOwnedPrivateAudioItem(user.id, id);
    const progress = await getPrivateAudioProgress(
      supabase,
      id,
      item.duration_seconds,
    );

    return NextResponse.json(
      { progress },
      { headers: privateNoStoreHeaders() },
    );
  } catch (error) {
    return handlePrivateAudioRouteError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const supabase = await createClient();
    const user = await requirePrivateAudioUser(supabase);
    const { id } = await context.params;

    // Ownership gate (neutral not_found).
    await getOwnedPrivateAudioItem(user.id, id);

    const body = (await request.json().catch(() => null)) as {
      positionSeconds?: unknown;
      durationSeconds?: unknown;
      completed?: unknown;
    } | null;

    if (
      !body ||
      typeof body.positionSeconds !== "number" ||
      !Number.isFinite(body.positionSeconds)
    ) {
      throw new PrivateAudioApiError("invalid_request", 400);
    }

    const progress = await savePrivateAudioProgress(supabase, id, {
      positionSeconds: body.positionSeconds,
      durationSeconds:
        typeof body.durationSeconds === "number" ? body.durationSeconds : null,
      completed: body.completed === true,
    });

    return NextResponse.json(
      { progress },
      { headers: privateNoStoreHeaders() },
    );
  } catch (error) {
    return handlePrivateAudioRouteError(error);
  }
}
