import { NextResponse } from "next/server";

import {
  processUserAvatarImage,
  userAvatarProcessErrorMessage,
} from "@/lib/profile/avatar-image";
import {
  assertUserAvatarPathForOwner,
  buildUserAvatarStoragePath,
  createUserAvatarSignedUrl,
  removeUserAvatarObject,
  USER_AVATAR_MAX_BYTES,
  USER_AVATARS_BUCKET,
} from "@/lib/profile/avatar";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function POST(request: Request) {
  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("profile_avatar_post_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("profile_avatar_post_load_error", profileError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: userAvatarProcessErrorMessage("missing_file"),
      },
      { status: 400 },
    );
  }

  if (file.size <= 0 || file.size > USER_AVATAR_MAX_BYTES) {
    return NextResponse.json(
      {
        error: "invalid_file_size",
        message: userAvatarProcessErrorMessage("invalid_file_size"),
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const processed = await processUserAvatarImage(buffer, file.type);

  if (!processed.ok) {
    return NextResponse.json(
      {
        error: processed.code,
        message: userAvatarProcessErrorMessage(processed.code),
      },
      { status: 400 },
    );
  }

  const previousPath = profile?.avatar_path ?? null;
  const nextPath = buildUserAvatarStoragePath(user.id);

  if (!assertUserAvatarPathForOwner(nextPath, user.id)) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const storage = createServiceRoleClient();

  const { error: uploadError } = await storage.storage
    .from(USER_AVATARS_BUCKET)
    .upload(nextPath, processed.buffer, {
      contentType: processed.contentType,
      upsert: false,
    });

  if (uploadError) {
    console.error("profile_avatar_upload_error", uploadError.message);
    return NextResponse.json(
      {
        error: "upload_failed",
        message: "Не удалось сохранить фотографию. Попробуйте ещё раз.",
      },
      { status: 500 },
    );
  }

  const cacheBuster = Date.now();

  const avatarUrl = await createUserAvatarSignedUrl(storage, nextPath, {
    userId: user.id,
    cacheBuster,
  });

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      avatar_path: nextPath,
      avatar_url: avatarUrl,
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("profile_avatar_update_error", updateError.message);
    const cleanup = await removeUserAvatarObject(storage, nextPath, user.id);

    if (!cleanup.ok) {
      console.error("profile_avatar_orphan_cleanup_error", cleanup.error);
    }

    return NextResponse.json(
      {
        error: "internal_error",
        message: "Не удалось сохранить фотографию. Попробуйте ещё раз.",
      },
      { status: 500 },
    );
  }

  if (
    previousPath &&
    previousPath !== nextPath &&
    assertUserAvatarPathForOwner(previousPath, user.id)
  ) {
    const removed = await removeUserAvatarObject(
      storage,
      previousPath,
      user.id,
    );

    if (!removed.ok) {
      console.error("profile_avatar_old_cleanup_error", removed.error);
    }
  }

  return NextResponse.json({
    avatarUrl,
    avatarPath: nextPath,
    cacheBuster,
  });
}

export async function DELETE(request: Request) {
  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("profile_avatar_delete_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("profile_avatar_delete_load_error", profileError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const previousPath = profile?.avatar_path ?? null;

  if (!previousPath) {
    return new NextResponse(null, { status: 204 });
  }

  if (!assertUserAvatarPathForOwner(previousPath, user.id)) {
    console.error("profile_avatar_delete_invalid_stored_path");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      avatar_path: null,
      avatar_url: null,
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("profile_avatar_clear_error", updateError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  try {
    const storage = createServiceRoleClient();
    const removed = await removeUserAvatarObject(
      storage,
      previousPath,
      user.id,
    );

    if (!removed.ok) {
      console.error("profile_avatar_storage_delete_error", removed.error);
    }
  } catch (error) {
    console.error(
      "profile_avatar_storage_delete_exception",
      error instanceof Error ? error.message : error,
    );
  }

  return new NextResponse(null, { status: 204 });
}
