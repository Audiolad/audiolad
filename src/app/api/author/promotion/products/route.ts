import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import { listAuthorProducts } from "@/lib/author-products/products";
import { requireAuthorPromotionAccess } from "@/lib/promotion/access";

function parseAuthorId(request: Request): string | null {
  const url = new URL(request.url);
  const authorId = url.searchParams.get("author_id")?.trim();
  return authorId || null;
}

export async function GET(request: Request) {
  try {
    const authorId = parseAuthorId(request);

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorPromotionAccess(authorId);
    const products = await listAuthorProducts(supabase, authorId);

    return NextResponse.json({
      products: products.filter((product) => product.status === "published"),
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
