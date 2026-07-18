import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { MAX_COVER_BYTES } from "@/lib/author-products/limits";
import { AUTHOR_BANNER_ERROR_MESSAGES } from "@/lib/authors/banner-validation-client";
import {
  buildAuthorAssetStoragePath,
  removeAuthorAssetFiles,
  type AuthorAssetKind,
} from "@/lib/authors/assets";
import { AUTHOR_ASSETS_BUCKET } from "@/lib/authors/constants";
import { getAuthorProfileDetail } from "@/lib/authors/profile";
import {
  cleanupImageManifest,
  primaryPublicUrl,
  uploadOptimizedImageSet,
} from "@/lib/images/image-upload-service";
import { parseImageManifest } from "@/lib/images/image-manifest";
import { imageProcessErrorMessage } from "@/lib/images/process-image";
import { avatarProcessErrorMessage } from "@/lib/images/process-avatar-image";

type RouteContext = {
  params: Promise<{ kind: string }>;
};

const ALLOWED_KINDS = new Set<AuthorAssetKind>(["avatar", "banner"]);

function resolveKind(value: string): AuthorAssetKind | null {
  return ALLOWED_KINDS.has(value as AuthorAssetKind)
    ? (value as AuthorAssetKind)
    : null;
}

function getUrlColumn(kind: AuthorAssetKind): "avatar_url" | "banner_url" {
  return kind === "avatar" ? "avatar_url" : "banner_url";
}

function getPathColumn(kind: AuthorAssetKind): "avatar_path" | "banner_path" {
  return kind === "avatar" ? "avatar_path" : "banner_path";
}

function getImageColumn(
  kind: AuthorAssetKind,
): "avatar_image" | "banner_image" {
  return kind === "avatar" ? "avatar_image" : "banner_image";
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { kind: rawKind } = await context.params;
    const kind = resolveKind(rawKind);

    if (!kind) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const url = new URL(request.url);
    const authorId = url.searchParams.get("author_id")?.trim();

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorMembership(authorId);

    const { data: existing } = await supabase
      .from("authors")
      .select("avatar_image, banner_image")
      .eq("id", authorId)
      .maybeSingle();

    const manifest =
      kind === "avatar"
        ? parseImageManifest(existing?.avatar_image)
        : parseImageManifest(existing?.banner_image);

    await removeAuthorAssetFiles(supabase, authorId, kind);

    if (manifest) {
      await cleanupImageManifest(supabase.storage, AUTHOR_ASSETS_BUCKET, manifest);
    }

    const { error: updateError } = await supabase
      .from("authors")
      .update({
        [getUrlColumn(kind)]: null,
        [getPathColumn(kind)]: null,
        [getImageColumn(kind)]: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", authorId);

    if (updateError) {
      console.error("author_asset_delete_error", updateError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const profile = await getAuthorProfileDetail(supabase, authorId);

    return NextResponse.json({ profile });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { kind: rawKind } = await context.params;
    const kind = resolveKind(rawKind);

    if (!kind) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const formData = await request.formData();
    const authorId =
      typeof formData.get("author_id") === "string"
        ? String(formData.get("author_id")).trim()
        : "";
    const file = formData.get("file");

    if (!authorId || !(file instanceof File)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_COVER_BYTES) {
      return NextResponse.json({ error: "invalid_file_size" }, { status: 400 });
    }

    const { supabase } = await requireAuthorMembership(authorId);
    const buffer = Buffer.from(await file.arrayBuffer());

    const { data: existing } = await supabase
      .from("authors")
      .select("avatar_image, banner_image")
      .eq("id", authorId)
      .maybeSingle();

    const previousManifest = parseImageManifest(
      kind === "avatar" ? existing?.avatar_image : existing?.banner_image,
    );

    const profileName =
      kind === "avatar" ? ("author-avatar" as const) : ("author-banner" as const);

    const uploaded = await uploadOptimizedImageSet({
      profile: profileName,
      bucket: AUTHOR_ASSETS_BUCKET,
      buffer,
      declaredMime: file.type,
      storage: supabase.storage,
      context: { authorId, authorKind: kind },
    });

    if (!uploaded.ok) {
      const message =
        kind === "avatar"
          ? avatarProcessErrorMessage(uploaded.code as "corrupt_image")
          : imageProcessErrorMessage(
              uploaded.code as "corrupt_image",
              "author-banner",
            );

      return NextResponse.json(
        {
          error: uploaded.code,
          message:
            kind === "banner" && uploaded.code === "invalid_aspect_ratio"
              ? AUTHOR_BANNER_ERROR_MESSAGES.tooSmall
              : message,
        },
        { status: uploaded.code === "upload_failed" ? 500 : 400 },
      );
    }

    const cacheBuster = Date.now();
    const assetUrl = `${primaryPublicUrl(AUTHOR_ASSETS_BUCKET, uploaded.data, cacheBuster)}`;
    const storagePath = uploaded.data.primaryDisplayPath;

    const { error: updateError } = await supabase
      .from("authors")
      .update({
        [getUrlColumn(kind)]: assetUrl,
        [getPathColumn(kind)]: storagePath,
        [getImageColumn(kind)]: uploaded.data.manifest,
        updated_at: new Date().toISOString(),
      })
      .eq("id", authorId);

    if (updateError) {
      console.error("author_asset_update_error", updateError.message);
      await cleanupImageManifest(
        supabase.storage,
        AUTHOR_ASSETS_BUCKET,
        uploaded.data.manifest,
      );
      return NextResponse.json(
        {
          error: "internal_error",
          message:
            kind === "banner"
              ? AUTHOR_BANNER_ERROR_MESSAGES.saveFailed
              : "Не удалось сохранить фотографию. Попробуйте ещё раз.",
        },
        { status: 500 },
      );
    }

    if (previousManifest) {
      await cleanupImageManifest(
        supabase.storage,
        AUTHOR_ASSETS_BUCKET,
        previousManifest,
      );
    }

    for (const legacyExt of ["jpg", "png", "webp"] as const) {
      const legacyPath = buildAuthorAssetStoragePath(authorId, kind, legacyExt);
      if (legacyPath !== storagePath) {
        await supabase.storage
          .from(AUTHOR_ASSETS_BUCKET)
          .remove([legacyPath])
          .catch(() => undefined);
      }
    }

    const profile = await getAuthorProfileDetail(supabase, authorId);

    return NextResponse.json({ profile, url: assetUrl });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
