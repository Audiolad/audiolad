import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { AuthorTermsError } from "@/lib/author-terms/errors";
import { peekAuthorExecutionContext } from "@/lib/author-support/context";
import { isConsentBlockedForExecution } from "@/lib/author-support/consent-guard";
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
    const execution = await peekAuthorExecutionContext();
    const status = await loadAuthorTermsStatus({
      authorId,
      role,
      supportMode: isConsentBlockedForExecution(execution),
    });

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
