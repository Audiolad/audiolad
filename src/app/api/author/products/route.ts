import { NextResponse } from "next/server";

import {
  validateTitleLength,
} from "@/lib/author-products/limits";
import {
  handleAuthorRouteError,
  requireAuthorMembership,
  requireAuthorMutationMembership,
} from "@/lib/author-products/auth";
import { createDraftProduct, listAuthorProducts } from "@/lib/author-products/products";
import { resolveCreateClassification } from "@/lib/author-products/publication-class";

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
    const productKindRaw =
      "product_kind" in body && typeof body.product_kind === "string"
        ? body.product_kind.trim()
        : "";
    const publicationClassRaw =
      "publication_class" in body && typeof body.publication_class === "string"
        ? body.publication_class.trim()
        : "";
    const cabinetBranchRaw =
      "cabinet_branch" in body && typeof body.cabinet_branch === "string"
        ? body.cabinet_branch.trim()
        : "";

    const classification = resolveCreateClassification({
      publicationClass: publicationClassRaw || null,
      cabinetBranch: cabinetBranchRaw || null,
      productKind: productKindRaw || null,
    });

    if (!classification.ok) {
      return NextResponse.json({ error: classification.error }, { status: 400 });
    }

    if (!authorId || !title) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const titleError = validateTitleLength(title);

    if (titleError) {
      return NextResponse.json({ error: titleError }, { status: 400 });
    }

    const { supabase } = await requireAuthorMutationMembership(authorId);
    const product = await createDraftProduct(supabase, {
      authorId,
      title,
      productKind: classification.value.productKind,
      publicationClass: classification.value.publicationClass,
      cabinetBranch: classification.value.cabinetBranch,
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
