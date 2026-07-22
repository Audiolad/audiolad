import { NextResponse } from "next/server";

import {
  validateTitleLength,
} from "@/lib/author-products/limits";
import {
  assertAuthorContentMutationsAllowed,
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import {
  createDraftProduct,
  listAuthorProducts,
} from "@/lib/author-products/products";

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

    const { supabase } = await requireAuthorMembership(authorId);
    const products = await listAuthorProducts(supabase, authorId);

    return NextResponse.json({ products });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const authorId =
      "author_id" in body && typeof body.author_id === "string"
        ? body.author_id.trim()
        : "";
    const title =
      "title" in body && typeof body.title === "string" ? body.title.trim() : "";

    if (!authorId || !title) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const titleError = validateTitleLength(title);

    if (titleError) {
      return NextResponse.json({ error: titleError }, { status: 400 });
    }

    const { supabase, accessStatus } = await requireAuthorMembership(authorId);
    assertAuthorContentMutationsAllowed(accessStatus);
    const product = await createDraftProduct(supabase, {
      authorId,
      title,
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
