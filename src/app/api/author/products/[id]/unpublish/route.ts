import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import {
  getUnpublishBlockerMessage,
  getProductLifecycleBlockers,
} from "@/lib/author-products/lifecycle";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import { unpublishPracticeProduct } from "@/lib/author-products/publish";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeMutationAccess(id);
    const serviceSupabase = createServiceRoleClient();

    const unpublishBlockerMessage = getUnpublishBlockerMessage(
      await getProductLifecycleBlockers(serviceSupabase, id),
    );

    if (unpublishBlockerMessage) {
      return NextResponse.json(
        {
          error: "starter_bundle",
          message: unpublishBlockerMessage,
        },
        { status: 409 },
      );
    }

    try {
      await unpublishPracticeProduct(supabase, id);
    } catch {
      console.error("author_unpublish_error", id);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const product = await getAuthorProductDetail(supabase, id);

    return NextResponse.json({
      product,
      message: "Аудиопродукт снят с публикации.",
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
