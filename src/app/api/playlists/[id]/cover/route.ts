import { NextResponse } from "next/server";

import {
  playlistCoverProcessErrorMessage,
  processPlaylistCoverImage,
} from "@/lib/playlists/cover-image";
import {
  assertPlaylistCoverPathForOwner,
  buildPlaylistCoverStoragePath,
  createPlaylistCoverSignedUrl,
  PLAYLIST_COVER_MAX_BYTES,
  PLAYLIST_COVERS_BUCKET,
  removePlaylistCoverObject,
  replacePlaylistCoverPathCas,
} from "@/lib/playlists/covers";
import { getOwnedPlaylistById } from "@/lib/playlists/queries";
import { isUuid } from "@/lib/playlists/validation";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function notFoundResponse() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

function conflictResponse() {
  return NextResponse.json(
    {
      error: "cover_conflict",
      message: "Обложка уже изменена. Обновите страницу и попробуйте ещё раз.",
    },
    { status: 409 },
  );
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return notFoundResponse();
  }

  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("playlist_cover_post_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { playlist, error: loadError } = await getOwnedPlaylistById(
    supabase,
    id,
  );

  if (loadError) {
    console.error("playlist_cover_post_load_error", loadError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!playlist) {
    return notFoundResponse();
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
        message: playlistCoverProcessErrorMessage("missing_file"),
      },
      { status: 400 },
    );
  }

  if (file.size <= 0 || file.size > PLAYLIST_COVER_MAX_BYTES) {
    return NextResponse.json(
      {
        error: "invalid_file_size",
        message: playlistCoverProcessErrorMessage("invalid_file_size"),
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const processed = await processPlaylistCoverImage(buffer, file.type);

  if (!processed.ok) {
    return NextResponse.json(
      {
        error: processed.code,
        message: playlistCoverProcessErrorMessage(processed.code),
      },
      { status: 400 },
    );
  }

  const expectedOldPath = playlist.cover_path;
  const nextPath = buildPlaylistCoverStoragePath(user.id, id);

  if (!assertPlaylistCoverPathForOwner(nextPath, user.id, id)) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const storage = createServiceRoleClient();

  const { error: uploadError } = await storage.storage
    .from(PLAYLIST_COVERS_BUCKET)
    .upload(nextPath, processed.buffer, {
      contentType: processed.contentType,
      upsert: false,
    });

  if (uploadError) {
    console.error("playlist_cover_upload_error", uploadError.message);
    return NextResponse.json(
      {
        error: "upload_failed",
        message: "Не удалось сохранить обложку. Попробуйте ещё раз.",
      },
      { status: 500 },
    );
  }

  const cas = await replacePlaylistCoverPathCas(
    supabase,
    id,
    expectedOldPath,
    nextPath,
  );

  if (!cas.ok) {
    console.error("playlist_cover_cas_error", cas.error);
    const cleanup = await removePlaylistCoverObject(
      storage,
      nextPath,
      user.id,
      id,
    );
    if (!cleanup.ok) {
      console.error("playlist_cover_orphan_cleanup_error", cleanup.error);
    }
    return NextResponse.json(
      {
        error: "internal_error",
        message: "Не удалось сохранить обложку. Попробуйте ещё раз.",
      },
      { status: 500 },
    );
  }

  if (cas.result.status === "not_found" || cas.result.status === "unauthorized") {
    const cleanup = await removePlaylistCoverObject(
      storage,
      nextPath,
      user.id,
      id,
    );
    if (!cleanup.ok) {
      console.error("playlist_cover_orphan_cleanup_error", cleanup.error);
    }
    return notFoundResponse();
  }

  if (cas.result.status === "conflict") {
    const cleanup = await removePlaylistCoverObject(
      storage,
      nextPath,
      user.id,
      id,
    );
    if (!cleanup.ok) {
      console.error("playlist_cover_orphan_cleanup_error", cleanup.error);
    }
    return conflictResponse();
  }

  const confirmedOld = cas.result.previous_path;

  if (
    confirmedOld &&
    confirmedOld !== nextPath &&
    assertPlaylistCoverPathForOwner(confirmedOld, user.id, id)
  ) {
    const removed = await removePlaylistCoverObject(
      storage,
      confirmedOld,
      user.id,
      id,
    );

    if (!removed.ok) {
      console.error("playlist_cover_old_cleanup_error", removed.error);
    }
  }

  const coverUrl = await createPlaylistCoverSignedUrl(storage, nextPath, {
    userId: user.id,
    playlistId: id,
  });

  return NextResponse.json({
    coverUrl,
    coverUpdatedAt: cas.result.cover_updated_at,
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return notFoundResponse();
  }

  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("playlist_cover_delete_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { playlist, error: loadError } = await getOwnedPlaylistById(
    supabase,
    id,
  );

  if (loadError) {
    console.error("playlist_cover_delete_load_error", loadError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!playlist) {
    return notFoundResponse();
  }

  const previousPath = playlist.cover_path;

  if (!previousPath) {
    return new NextResponse(null, { status: 204 });
  }

  if (!assertPlaylistCoverPathForOwner(previousPath, user.id, id)) {
    console.error("playlist_cover_delete_invalid_stored_path");
    return NextResponse.json(
      {
        error: "internal_error",
        message:
          "Не удалось вернуть автоматическую обложку. Попробуйте ещё раз.",
      },
      { status: 500 },
    );
  }

  const cas = await replacePlaylistCoverPathCas(
    supabase,
    id,
    previousPath,
    null,
  );

  if (!cas.ok) {
    console.error("playlist_cover_clear_cas_error", cas.error);
    return NextResponse.json(
      {
        error: "internal_error",
        message:
          "Не удалось вернуть автоматическую обложку. Попробуйте ещё раз.",
      },
      { status: 500 },
    );
  }

  if (cas.result.status === "not_found" || cas.result.status === "unauthorized") {
    return notFoundResponse();
  }

  if (cas.result.status === "conflict") {
    // Parallel replace won — do not delete the new object.
    return conflictResponse();
  }

  // status ok (including idempotent already-null)
  if (cas.result.previous_path) {
    try {
      const storage = createServiceRoleClient();
      const removed = await removePlaylistCoverObject(
        storage,
        cas.result.previous_path,
        user.id,
        id,
      );

      if (!removed.ok) {
        console.error("playlist_cover_storage_delete_error", removed.error);
      }
    } catch (error) {
      console.error(
        "playlist_cover_storage_delete_exception",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return new NextResponse(null, { status: 204 });
}
