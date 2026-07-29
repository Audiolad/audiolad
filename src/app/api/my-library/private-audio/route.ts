import { NextResponse } from "next/server";

import { requirePrivateAudioUser } from "@/lib/private-audio/server/access";
import {
  handlePrivateAudioRouteError,
  PrivateAudioApiError,
  privateNoStoreHeaders,
} from "@/lib/private-audio/server/errors";
import { createPrivateAudioOpId } from "@/lib/private-audio/server/logging";
import {
  getPrivateAudioDetail,
  listPrivateAudioItems,
} from "@/lib/private-audio/server/repository";
import { createPrivateAudioItemWithUpload } from "@/lib/private-audio/server/uploads";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const opId = createPrivateAudioOpId();

  try {
    const supabase = await createClient();
    const user = await requirePrivateAudioUser(supabase);
    const items = await listPrivateAudioItems(supabase, user.id);

    return NextResponse.json(
      { items },
      { headers: privateNoStoreHeaders(opId) },
    );
  } catch (error) {
    if (error instanceof PrivateAudioApiError && !error.opId) {
      error.opId = opId;
      if (error.stage === "unknown") {
        error.stage = "auth";
      }
    }

    return handlePrivateAudioRouteError(error, opId);
  }
}

export async function POST(request: Request) {
  const opId = createPrivateAudioOpId();

  try {
    const supabase = await createClient();
    let user;

    try {
      user = await requirePrivateAudioUser(supabase);
    } catch (error) {
      if (error instanceof PrivateAudioApiError) {
        throw new PrivateAudioApiError(error.code, error.status, {
          stage: "auth",
          opId,
        });
      }

      throw error;
    }

    let formData: FormData;

    try {
      formData = await request.formData();
    } catch {
      throw new PrivateAudioApiError("invalid_request", 400, {
        stage: "parse_form",
        opId,
      });
    }

    const titleValue = formData.get("title");
    const authorValue = formData.get("authorText");
    const rightsValue = formData.get("rightsAccepted");
    const audioFile = formData.get("file");
    const coverFile = formData.get("cover");

    if (!(audioFile instanceof File)) {
      throw new PrivateAudioApiError("invalid_request", 400, {
        stage: "parse_form",
        opId,
      });
    }

    if (typeof titleValue !== "string") {
      throw new PrivateAudioApiError("invalid_title", 422, {
        stage: "validate_metadata",
        opId,
      });
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
      opId,
    });

    const item = await getPrivateAudioDetail(supabase, user.id, row.id);

    return NextResponse.json(
      { item },
      { status: 201, headers: privateNoStoreHeaders(opId) },
    );
  } catch (error) {
    if (error instanceof PrivateAudioApiError && !error.opId) {
      error.opId = opId;
    }

    return handlePrivateAudioRouteError(error, opId);
  }
}
