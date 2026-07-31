import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { canWithdrawPracticeFromModeration } from "@/lib/author-products/moderation";
import { withdrawPracticeFromModeration } from "@/lib/author-products/moderation-actions";
import { getAuthorProductDetail } from "@/lib/author-products/products";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice } = await requirePracticeMutationAccess(id);

    if (
      !canWithdrawPracticeFromModeration({
        moderationStatus: practice.moderation_status,
        deletedAt: practice.deleted_at,
      })
    ) {
      return NextResponse.json(
        {
          error: "invalid_moderation_status_for_withdraw",
          message: "Отозвать можно только продукт, который сейчас на модерации.",
        },
        { status: 409 },
      );
    }

    try {
      await withdrawPracticeFromModeration(supabase, id);
    } catch (withdrawError) {
      if (
        withdrawError &&
        typeof withdrawError === "object" &&
        "code" in withdrawError &&
        "message" in withdrawError
      ) {
        const mapped = withdrawError as {
          code: string;
          message: string;
          status?: number;
        };

        return NextResponse.json(
          {
            error: mapped.code,
            message: mapped.message,
          },
          { status: mapped.status ?? 400 },
        );
      }

      console.error("author_withdraw_moderation_error", id, withdrawError);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({
      product,
      message: "Продукт отозван с модерации. Теперь его можно редактировать.",
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
