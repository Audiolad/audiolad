import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { restorePracticeFromArchive } from "@/lib/author-products/lifecycle";
import { getAuthorProductDetail } from "@/lib/author-products/products";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeMutationAccess(id);

    try {
      await restorePracticeFromArchive(supabase, id);
    } catch (error) {
      const code =
        error instanceof Error
          ? error.message
          : "practice_restore_from_archive_failed";

      if (code === "practice_not_found") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }

      console.error("author_restore_from_archive_error", id, code);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const product = await getAuthorProductDetail(supabase, id);

    if (!product) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({
      product,
      message:
        "Аудиопродукт возвращён из архива. Чтобы показать его в каталоге, опубликуйте его снова.",
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
