import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeAccess,
} from "@/lib/author-products/auth";
import {
  getCoverExtension,
  MAX_COVER_BYTES,
} from "@/lib/author-products/media";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import {
  buildCoverStoragePath,
  getCoverPublicUrl,
} from "@/lib/author-products/utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const COVER_EXTENSIONS = ["jpg", "png", "webp"] as const;

async function removePracticeCoverFiles(
  supabase: Awaited<ReturnType<typeof requirePracticeAccess>>["supabase"],
  practiceId: string,
) {
  const paths = COVER_EXTENSIONS.map((extension) =>
    buildCoverStoragePath(practiceId, extension),
  );

  await supabase.storage.from("practice-covers").remove(paths);
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeAccess(id);

    await removePracticeCoverFiles(supabase, id);

    const { error: updateError } = await supabase
      .from("practices")
      .update({
        cover_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("author_cover_delete_error", updateError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({ product, cover_url: null });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeAccess(id);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_COVER_BYTES) {
      return NextResponse.json({ error: "invalid_file_size" }, { status: 400 });
    }

    const extension = getCoverExtension(file);

    if (!extension) {
      return NextResponse.json({ error: "invalid_file_type" }, { status: 400 });
    }

    const storagePath = buildCoverStoragePath(id, extension);
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("practice-covers")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("author_cover_upload_error", uploadError.message);
      return NextResponse.json({ error: "upload_failed" }, { status: 500 });
    }

    for (const oldExtension of COVER_EXTENSIONS) {
      if (oldExtension === extension) {
        continue;
      }

      const oldPath = buildCoverStoragePath(id, oldExtension);
      await supabase.storage.from("practice-covers").remove([oldPath]);
    }

    const coverUrl = getCoverPublicUrl(storagePath);

    const { error: updateError } = await supabase
      .from("practices")
      .update({
        cover_url: coverUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("author_cover_update_error", updateError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({ product, cover_url: coverUrl });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
