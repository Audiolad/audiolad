import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { startPracticeEditing } from "@/lib/author-products/lifecycle-actions";
import { getAuthorProductDetail } from "@/lib/author-products/products";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice } = await requirePracticeMutationAccess(id);

    try {
      await startPracticeEditing(supabase, id);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof (error as { message: unknown }).message === "string"
      ) {
        const mapped = error as {
          message: string;
          code?: string;
          status?: number;
        };
        console.info("author_start_editing_failed", {
          practiceId: id,
          code: mapped.code ?? null,
        });
        return NextResponse.json(
          {
            error: mapped.code ?? "lifecycle_action_failed",
            message: mapped.message,
          },
          { status: mapped.status ?? 409 },
        );
      }

      console.error("author_start_editing_error", id, error);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const product = await getAuthorProductDetail(supabase, id);

    console.info("author_start_editing_ok", {
      practiceId: id,
      authorId: practice.author_id,
      fromStatus: practice.status,
      fromModeration: practice.moderation_status,
    });

    return NextResponse.json({
      product,
      message:
        "Продукт готов к редактированию. После изменений отправьте его на модерацию повторно.",
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
