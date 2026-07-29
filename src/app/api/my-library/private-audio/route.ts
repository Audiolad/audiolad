import { NextResponse } from "next/server";

import { requirePrivateAudioUser } from "@/lib/private-audio/server/access";
import {
  handlePrivateAudioRouteError,
  PrivateAudioApiError,
  privateNoStoreHeaders,
} from "@/lib/private-audio/server/errors";
import {
  getPrivateAudioDetail,
  listPrivateAudioItems,
} from "@/lib/private-audio/server/repository";
import { createPrivateAudioItemWithUpload } from "@/lib/private-audio/server/uploads";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const user = await requirePrivateAudioUser(supabase);
    const items = await listPrivateAudioItems(supabase, user.id);

    return NextResponse.json(
      { items },
      { headers: privateNoStoreHeaders() },
    );
  } catch (error) {
    return handlePrivateAudioRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const user = await requirePrivateAudioUser(supabase);

    const formData = await request.formData();
    const titleValue = formData.get("title");
    const authorValue = formData.get("authorText");
    const rightsValue = formData.get("rightsAccepted");
    const audioFile = formData.get("file");
    const coverFile = formData.get("cover");

    if (!(audioFile instanceof File)) {
      throw new PrivateAudioApiError("invalid_request", 400);
    }

    if (typeof titleValue !== "string") {
      throw new PrivateAudioApiError("invalid_title", 422);
    }

    const rightsAccepted =
      rightsValue === "true" ||
      rightsValue === "1" ||
      rightsValue === "on";

    const row = await createPrivateAudioItemWithUpload({
      ownerUserId: user.id,
      title: titleValue,
      authorText: typeof authorValue === "string" ? authorValue : null,
      rightsAccepted,
      audioFile,
      coverFile: coverFile instanceof File ? coverFile : null,
    });

    const item = await getPrivateAudioDetail(supabase, user.id, row.id);

    return NextResponse.json(
      { item },
      { status: 201, headers: privateNoStoreHeaders() },
    );
  } catch (error) {
    return handlePrivateAudioRouteError(error);
  }
}
