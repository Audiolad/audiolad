import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  createProductVideoCoverSignedUrl,
  deleteProductVideoCover,
  getProductVideoAssets,
  uploadProductVideoCover,
} from "@/lib/product-video-export/server";
import {
  parseProductVideoOrientation,
  productVideoCoverColumn,
} from "@/lib/product-video-export/contract";

type RouteContext = {
  params: Promise<{ id: string; orientation: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id, orientation: rawOrientation } = await context.params;
    const orientation = parseProductVideoOrientation(rawOrientation);
    if (!orientation) {
      return NextResponse.json({ error: "invalid_orientation" }, { status: 400 });
    }
    const assets = await getProductVideoAssets(id);
    const path = assets[productVideoCoverColumn(orientation)];
    const previewUrl = await createProductVideoCoverSignedUrl(path);
    return NextResponse.json(
      { orientation, hasCover: Boolean(path), previewUrl },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id, orientation: rawOrientation } = await context.params;
    const orientation = parseProductVideoOrientation(rawOrientation);
    if (!orientation) {
      return NextResponse.json({ error: "invalid_orientation" }, { status: 400 });
    }
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const result = await uploadProductVideoCover({
      practiceId: id,
      orientation,
      file,
    });
    return NextResponse.json({
      orientation,
      hasCover: true,
      previewUrl: result.previewUrl,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, orientation: rawOrientation } = await context.params;
    const orientation = parseProductVideoOrientation(rawOrientation);
    if (!orientation) {
      return NextResponse.json({ error: "invalid_orientation" }, { status: 400 });
    }
    await deleteProductVideoCover({ practiceId: id, orientation });
    return NextResponse.json({ orientation, hasCover: false, previewUrl: null });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
