import { NextResponse } from "next/server";

import { requirePrivateAudioUser } from "@/lib/private-audio/server/access";
import {
  handlePrivateAudioRouteError,
  PrivateAudioApiError,
  privateNoStoreHeaders,
} from "@/lib/private-audio/server/errors";
import {
  getPrivateAudioDetail,
  updatePrivateAudioMetadata,
} from "@/lib/private-audio/server/repository";
import { deletePrivateAudioItemCompletely } from "@/lib/private-audio/server/uploads";
import {
  normalizePrivateAuthorText,
  normalizePrivateTitle,
} from "@/lib/private-audio/validation";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const supabase = await createClient();
    const user = await requirePrivateAudioUser(supabase);
    const { id } = await context.params;
    const item = await getPrivateAudioDetail(supabase, user.id, id);

    return NextResponse.json(
      { item },
      { headers: privateNoStoreHeaders() },
    );
  } catch (error) {
    return handlePrivateAudioRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const supabase = await createClient();
    const user = await requirePrivateAudioUser(supabase);
    const { id } = await context.params;

    const body = (await request.json().catch(() => null)) as {
      title?: unknown;
      authorText?: unknown;
    } | null;

    if (!body || typeof body.title !== "string") {
      throw new PrivateAudioApiError("invalid_title", 422);
    }

    const title = normalizePrivateTitle(body.title);

    if (!title) {
      throw new PrivateAudioApiError("invalid_title", 422);
    }

    const authorRaw =
      body.authorText === null || body.authorText === undefined
        ? null
        : typeof body.authorText === "string"
          ? body.authorText
          : null;

    if (body.authorText !== null && body.authorText !== undefined) {
      if (typeof body.authorText !== "string") {
        throw new PrivateAudioApiError("invalid_author_text", 422);
      }
    }

    const authorText = normalizePrivateAuthorText(authorRaw);

    if (
      typeof body.authorText === "string" &&
      body.authorText.trim() !== "" &&
      authorText === null
    ) {
      throw new PrivateAudioApiError("invalid_author_text", 422);
    }

    await updatePrivateAudioMetadata({
      ownerUserId: user.id,
      itemId: id,
      title,
      authorText,
    });

    const item = await getPrivateAudioDetail(supabase, user.id, id);

    return NextResponse.json(
      { item },
      { headers: privateNoStoreHeaders() },
    );
  } catch (error) {
    return handlePrivateAudioRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const supabase = await createClient();
    const user = await requirePrivateAudioUser(supabase);
    const { id } = await context.params;

    await deletePrivateAudioItemCompletely({
      ownerUserId: user.id,
      itemId: id,
    });

    return NextResponse.json(
      { ok: true },
      { headers: privateNoStoreHeaders() },
    );
  } catch (error) {
    return handlePrivateAudioRouteError(error);
  }
}
