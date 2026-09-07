import { NextResponse } from "next/server";

import { AVATAR_ERROR_MESSAGES, AVATAR_MAX_SOURCE_BYTES } from "@/lib/images/avatar-constants";
import { renderAvatarPreviewJpeg } from "@/lib/images/avatar-source-prepare";
import { avatarProcessErrorMessage } from "@/lib/images/process-avatar-image";
import { createClientFromRequest } from "@/lib/supabase/request-client";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const supabase = await createClientFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: AVATAR_ERROR_MESSAGES.notImage },
      { status: 400 },
    );
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "missing_file", message: AVATAR_ERROR_MESSAGES.notImage },
      { status: 400 },
    );
  }

  if (file.size <= 0 || file.size > AVATAR_MAX_SOURCE_BYTES) {
    return NextResponse.json(
      { error: "invalid_file_size", message: AVATAR_ERROR_MESSAGES.fileTooLarge },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const prepared = await renderAvatarPreviewJpeg(buffer, file.type);

  if (!prepared.ok || !prepared.preview) {
    return NextResponse.json(
      {
        error: prepared.ok ? "corrupt_image" : prepared.code,
        message: avatarProcessErrorMessage(
          prepared.ok ? "corrupt_image" : prepared.code,
        ),
      },
      { status: 400 },
    );
  }

  return new NextResponse(new Uint8Array(prepared.preview), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
      "X-Avatar-Preview-Width": String(prepared.width),
      "X-Avatar-Preview-Height": String(prepared.height),
    },
  });
}
