import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeAccess,
} from "@/lib/author-products/auth";
import { getAuthorProductDetail } from "@/lib/author-products/products";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeAccess(id);

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("practices")
      .update({
        status: "archived",
        updated_at: now,
      })
      .eq("id", id);

    if (error) {
      console.error("author_unpublish_error", error.message);
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
