import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { AuthorTermsError } from "@/lib/author-terms/errors";
import { loadAuthorTermsStatus } from "@/lib/author-terms/service";

export const dynamic = "force-dynamic";

function resolveAuthorId(request: Request) {
  return new URL(request.url).searchParams.get("author_id")?.trim() || "";
}

export async function GET(request: Request) {
  try {
    const authorId = resolveAuthorId(request);
    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { role } = await requireAuthorMembership(authorId);
    const status = await loadAuthorTermsStatus({ authorId, role });

    return NextResponse.json(
      { status },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    if (error instanceof AuthorTermsError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    return handleAuthorRouteError(error);
  }
}
