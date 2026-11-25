import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  abandonProductVideoBackgroundUpload,
  createProductVideoAssetSignedUrl,
  deleteProductVideoBackground,
  finalizeProductVideoBackgroundUpload,
  getProductVideoAssets,
  startProductVideoBackgroundUpload,
} from "@/lib/product-video-export/server";
import {
  parseProductVideoOrientation,
  productVideoBackgroundColumn,
  productVideoBackgroundPosterStoragePath,
} from "@/lib/product-video-export/contract";

type RouteContext = {
  params: Promise<{ id: string; orientation: string }>;
};

async function readContext(context: RouteContext) {
  const { id, orientation: rawOrientation } = await context.params;
  return { id, orientation: parseProductVideoOrientation(rawOrientation) };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id, orientation } = await readContext(context);
    if (!orientation) {
      return NextResponse.json({ error: "invalid_orientation" }, { status: 400 });
    }
    const assets = await getProductVideoAssets(id);
    const path = assets[productVideoBackgroundColumn(orientation)];
    const [previewUrl, posterUrl] = await Promise.all([
      createProductVideoAssetSignedUrl(path),
      createProductVideoAssetSignedUrl(
        path ? productVideoBackgroundPosterStoragePath(path) : null,
      ),
    ]);
    return NextResponse.json(
      { orientation, hasBackground: Boolean(path), previewUrl, posterUrl },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id, orientation } = await readContext(context);
    if (!orientation) {
      return NextResponse.json({ error: "invalid_orientation" }, { status: 400 });
    }
    const body = (await request.json().catch(() => null)) as {
      file_name?: unknown;
      file_size?: unknown;
      mime_type?: unknown;
    } | null;
    if (
      typeof body?.file_name !== "string" ||
      typeof body.file_size !== "number" ||
      typeof body.mime_type !== "string"
    ) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const started = await startProductVideoBackgroundUpload({
      practiceId: id,
      orientation,
      fileName: body.file_name,
      fileSize: body.file_size,
      mimeType: body.mime_type,
    });
    return NextResponse.json(started, { status: 201 });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id, orientation } = await readContext(context);
    if (!orientation) {
      return NextResponse.json({ error: "invalid_orientation" }, { status: 400 });
    }
    const body = (await request.json().catch(() => null)) as {
      upload_path?: unknown;
      file_size?: unknown;
    } | null;
    if (
      typeof body?.upload_path !== "string" ||
      typeof body.file_size !== "number"
    ) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const result = await finalizeProductVideoBackgroundUpload({
      practiceId: id,
      orientation,
      uploadPath: body.upload_path,
      fileSize: body.file_size,
    });
    return NextResponse.json({
      orientation,
      hasBackground: true,
      previewUrl: result.previewUrl,
      posterUrl: result.posterUrl,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id, orientation } = await readContext(context);
    if (!orientation) {
      return NextResponse.json({ error: "invalid_orientation" }, { status: 400 });
    }
    const uploadPath = new URL(request.url).searchParams.get("uploadPath");
    if (uploadPath) {
      await abandonProductVideoBackgroundUpload({
        practiceId: id,
        orientation,
        uploadPath,
      });
    } else {
      await deleteProductVideoBackground({
        practiceId: id,
        orientation,
      });
    }
    return NextResponse.json({
      orientation,
      hasBackground: false,
      previewUrl: null,
      posterUrl: null,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
