import { NextResponse } from "next/server";

import {
  cleanupImageManifest,
  uploadOptimizedImageSet,
} from "@/lib/images/image-upload-service";
import { parseImageManifest } from "@/lib/images/image-manifest";
import { imageProcessErrorMessage } from "@/lib/images/process-image";
import { avatarProcessErrorMessage } from "@/lib/images/process-avatar-image";
import {
  assertUserAvatarPathForOwner,
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
    .select("avatar_path, avatar_image")
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
        message: imageProcessErrorMessage("missing_file", "user-avatar"),
      },
      { status: 400 },
    );
  }

  if (file.size <= 0 || file.size > USER_AVATAR_MAX_BYTES) {
    return NextResponse.json(
      {
        error: "invalid_file_size",
        message: imageProcessErrorMessage("invalid_file_size", "user-avatar"),
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = createServiceRoleClient();
  const previousPath = profile?.avatar_path ?? null;
  const previousManifest = parseImageManifest(profile?.avatar_image);

  const uploaded = await uploadOptimizedImageSet({
    profile: "user-avatar",
    bucket: USER_AVATARS_BUCKET,
    buffer,
    declaredMime: file.type,
    storage: storage.storage,
    context: { userId: user.id },
  });

  if (!uploaded.ok) {
    return NextResponse.json(
      {
        error: uploaded.code,
        message: avatarProcessErrorMessage(uploaded.code as "corrupt_image"),
      },
      { status: uploaded.code === "upload_failed" ? 500 : 400 },
    );
  }

  const nextPath = uploaded.data.primaryDisplayPath;

  if (!assertUserAvatarPathForOwner(nextPath, user.id)) {
    await cleanupImageManifest(
      storage.storage,
      USER_AVATARS_BUCKET,
      uploaded.data.manifest,
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
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
      avatar_image: uploaded.data.manifest,
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("profile_avatar_update_error", updateError.message);
    await cleanupImageManifest(
      storage.storage,
      USER_AVATARS_BUCKET,
      uploaded.data.manifest,
    );
    return NextResponse.json(
      {
        error: "internal_error",
        message: "Не удалось сохранить фотографию. Попробуйте ещё раз.",
      },
      { status: 500 },
    );
  }

  if (previousManifest) {
    await cleanupImageManifest(
      storage.storage,
      USER_AVATARS_BUCKET,
      previousManifest,
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
    avatar_image: uploaded.data.manifest,
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
    .select("avatar_path, avatar_image")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("profile_avatar_delete_load_error", profileError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const previousPath = profile?.avatar_path ?? null;
  const previousManifest = parseImageManifest(profile?.avatar_image);

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
      avatar_image: null,
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("profile_avatar_clear_error", updateError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  try {
    const storage = createServiceRoleClient();

    if (previousManifest) {
      await cleanupImageManifest(
        storage.storage,
        USER_AVATARS_BUCKET,
        previousManifest,
      );
    }

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
