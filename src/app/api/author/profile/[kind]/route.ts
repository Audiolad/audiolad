import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { getCoverExtension } from "@/lib/author-products/media";
import { MAX_COVER_BYTES } from "@/lib/author-products/limits";
import { COVER_EXTENSIONS } from "@/lib/author-products/utils";
import { AUTHOR_BANNER_ERROR_MESSAGES } from "@/lib/authors/banner-validation-client";
import { validateAuthorBannerBuffer } from "@/lib/authors/banner-validation-server";
import {
  buildAuthorAssetStoragePath,
  getAuthorAssetPublicUrl,
  removeAuthorAssetFiles,
  type AuthorAssetKind,
} from "@/lib/authors/assets";
import { AUTHOR_ASSETS_BUCKET } from "@/lib/authors/constants";
import { getAuthorProfileDetail } from "@/lib/authors/profile";

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

    await removeAuthorAssetFiles(supabase, authorId, kind);

    const { error: updateError } = await supabase
      .from("authors")
      .update({
        [getUrlColumn(kind)]: null,
        [getPathColumn(kind)]: null,
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

    const { supabase } = await requireAuthorMembership(authorId);
    const buffer = Buffer.from(await file.arrayBuffer());

    if (kind === "banner") {
      const validated = await validateAuthorBannerBuffer(buffer, file.type);

      if (!validated.ok) {
        return NextResponse.json(
          {
            error: validated.code,
            message: validated.message,
          },
          { status: 400 },
        );
      }

      const extension = getCoverExtension(file);

      if (!extension) {
        return NextResponse.json(
          {
            error: "invalid_file_type",
            message: AUTHOR_BANNER_ERROR_MESSAGES.unsupportedFormat,
          },
          { status: 400 },
        );
      }

      const storagePath = buildAuthorAssetStoragePath(authorId, kind, extension);

      const { error: uploadError } = await supabase.storage
        .from(AUTHOR_ASSETS_BUCKET)
        .upload(storagePath, buffer, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadError) {
        console.error("author_asset_upload_error", uploadError.message);
        return NextResponse.json(
          {
            error: "upload_failed",
            message: AUTHOR_BANNER_ERROR_MESSAGES.saveFailed,
          },
          { status: 500 },
        );
      }

      for (const oldExtension of COVER_EXTENSIONS) {
        if (oldExtension === extension) {
          continue;
        }

        const oldPath = buildAuthorAssetStoragePath(authorId, kind, oldExtension);
        await supabase.storage.from(AUTHOR_ASSETS_BUCKET).remove([oldPath]);
      }

      const cacheBuster = Date.now();
      const assetUrl = `${getAuthorAssetPublicUrl(storagePath)}?v=${cacheBuster}`;

      const { error: updateError } = await supabase
        .from("authors")
        .update({
          [getUrlColumn(kind)]: assetUrl,
          [getPathColumn(kind)]: storagePath,
          updated_at: new Date().toISOString(),
        })
        .eq("id", authorId);

      if (updateError) {
        console.error("author_asset_update_error", updateError.message);
        return NextResponse.json(
          {
            error: "internal_error",
            message: AUTHOR_BANNER_ERROR_MESSAGES.saveFailed,
          },
          { status: 500 },
        );
      }

      const profile = await getAuthorProfileDetail(supabase, authorId);

      return NextResponse.json({ profile, url: assetUrl });
    }

    if (file.size <= 0 || file.size > MAX_COVER_BYTES) {
      return NextResponse.json({ error: "invalid_file_size" }, { status: 400 });
    }

    const extension = getCoverExtension(file);

    if (!extension) {
      return NextResponse.json({ error: "invalid_file_type" }, { status: 400 });
    }

    const storagePath = buildAuthorAssetStoragePath(authorId, kind, extension);

    const { error: uploadError } = await supabase.storage
      .from(AUTHOR_ASSETS_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("author_asset_upload_error", uploadError.message);
      return NextResponse.json({ error: "upload_failed" }, { status: 500 });
    }

    for (const oldExtension of COVER_EXTENSIONS) {
      if (oldExtension === extension) {
        continue;
      }

      const oldPath = buildAuthorAssetStoragePath(authorId, kind, oldExtension);
      await supabase.storage.from(AUTHOR_ASSETS_BUCKET).remove([oldPath]);
    }

    const assetUrl = getAuthorAssetPublicUrl(storagePath);

    const { error: updateError } = await supabase
      .from("authors")
      .update({
        [getUrlColumn(kind)]: assetUrl,
        [getPathColumn(kind)]: storagePath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", authorId);

    if (updateError) {
      console.error("author_asset_update_error", updateError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const profile = await getAuthorProfileDetail(supabase, authorId);

    return NextResponse.json({ profile, url: assetUrl });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
