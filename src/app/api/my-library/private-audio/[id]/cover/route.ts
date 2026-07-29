import { NextResponse } from "next/server";

import { requirePrivateAudioUser } from "@/lib/private-audio/server/access";
import {
  handlePrivateAudioRouteError,
  PrivateAudioApiError,
  privateNoStoreHeaders,
} from "@/lib/private-audio/server/errors";
import { getPrivateAudioDetail } from "@/lib/private-audio/server/repository";
import {
  deletePrivateAudioCover,
  replacePrivateAudioCover,
} from "@/lib/private-audio/server/uploads";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const supabase = await createClient();
    const user = await requirePrivateAudioUser(supabase);
    const { id } = await context.params;

    const formData = await request.formData();
    const coverFile = formData.get("cover");

    if (!(coverFile instanceof File)) {
      throw new PrivateAudioApiError("invalid_request", 400);
    }

    await replacePrivateAudioCover({
      ownerUserId: user.id,
      itemId: id,
      coverFile,
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

    await deletePrivateAudioCover({
      ownerUserId: user.id,
      itemId: id,
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
