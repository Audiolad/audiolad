import { NextResponse } from "next/server";

import {
  AuthorAccessError,
  handleAuthorRouteError,
  listAuthorWorkspacesForUser,
  requireAuthenticatedUser,
} from "@/lib/author-products/auth";
import { hasPermission } from "@/lib/auth/platform-access";
import {
  PRIMARY_QUERY_AI_ERROR_MESSAGES,
  PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY,
  primaryQueryAiHttpStatus,
} from "@/lib/seo/primary-query-suggestions/errors";
import { generatePrimaryQuerySuggestions } from "@/lib/seo/primary-query-suggestions/orchestrate";
import { parsePrimaryQuerySuggestionsRequest } from "@/lib/seo/primary-query-suggestions/validate";

export const dynamic = "force-dynamic";

async function requireAuthorSeoToolAccess() {
  const { supabase, user } = await requireAuthenticatedUser();
  const isAdmin = await hasPermission(supabase, user.id, "admin_panel.access");
  if (isAdmin) {
    return { user };
  }

  const workspaces = await listAuthorWorkspacesForUser(user.id, supabase);
  if (workspaces.length === 0) {
    throw new AuthorAccessError("forbidden", 403);
  }

  return { user };
}

/**
 * Author/admin short search-phrase hypotheses after Wordstat NO_RESULTS.
 * Returns a local draft only and does not persist or notify search engines.
 */
export async function POST(request: Request) {
  try {
    const { user } = await requireAuthorSeoToolAccess();

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const parsed = parsePrimaryQuerySuggestionsRequest(body);
    if (!parsed.ok) {
      return NextResponse.json(
        {
          error: PRIMARY_QUERY_AI_ERROR_MESSAGES.INVALID_INPUT,
          code: "INVALID_INPUT",
        },
        { status: primaryQueryAiHttpStatus("INVALID_INPUT") },
      );
    }

    const result = await generatePrimaryQuerySuggestions(parsed.input, {
      userId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error.message,
          code: result.error.code,
        },
        { status: primaryQueryAiHttpStatus(result.error.code) },
      );
    }

    return NextResponse.json({ suggestions: result.suggestions });
  } catch (error) {
    if (error instanceof AuthorAccessError) {
      return handleAuthorRouteError(error);
    }

    console.error(
      "primary_query_suggestions_route_error",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      {
        error: PRIMARY_QUERY_AI_FALLBACK_FAILED_COPY,
        code: "PROVIDER_ERROR",
      },
      { status: primaryQueryAiHttpStatus("PROVIDER_ERROR") },
    );
  }
}
