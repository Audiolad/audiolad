import { NextResponse } from "next/server";

import {
  AuthorAccessError,
  handleAuthorRouteError,
  listAuthorWorkspacesForUser,
  requireAuthenticatedUser,
} from "@/lib/author-products/auth";
import { hasPermission } from "@/lib/auth/platform-access";
import { fetchWordstatSuggestions } from "@/lib/seo/wordstat/client";
import {
  WORDSTAT_ERROR_MESSAGES,
  wordstatError,
  wordstatHttpStatus,
} from "@/lib/seo/wordstat/errors";

export const dynamic = "force-dynamic";

function readClientPhrase(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "";
  }

  const phrase = (body as { phrase?: unknown }).phrase;
  return typeof phrase === "string" ? phrase : "";
}

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
 * Author/admin Wordstat GetTop proxy.
 * Client may send only { phrase }. Server sets folderId, regions, devices.
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

    const result = await fetchWordstatSuggestions(readClientPhrase(body), {
      userId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error.message,
          code: result.error.code,
        },
        { status: wordstatHttpStatus(result.error.code) },
      );
    }

    return NextResponse.json(result.data);
  } catch (error) {
    if (error instanceof AuthorAccessError) {
      return handleAuthorRouteError(error);
    }

    console.error("wordstat_route_error", error instanceof Error ? error.name : "unknown");
    const fallback = wordstatError("UPSTREAM_ERROR");
    return NextResponse.json(
      {
        error: WORDSTAT_ERROR_MESSAGES.UPSTREAM_ERROR,
        code: fallback.error.code,
      },
      { status: wordstatHttpStatus("UPSTREAM_ERROR") },
    );
  }
}
