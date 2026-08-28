import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import {
  isVisibilityLookupEmail,
  sanitizeVisibilitySearchHit,
  shouldSearchVisibilityUsers,
  validateVisibilityLookupQuery,
  type PracticeVisibilitySearchHit,
} from "@/lib/author-products/visibility-users";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function mapExactLookupUser(row: {
  user_id?: string;
  display_name?: string;
  email?: string | null;
}): PracticeVisibilitySearchHit | null {
  return sanitizeVisibilitySearchHit({
    user_id: row.user_id,
    display_name: row.display_name,
    email: row.email,
  });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeMutationAccess(id);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "invalid_request", users: [] },
        { status: 400 },
      );
    }

    if (!body || typeof body !== "object" || !("query" in body)) {
      return NextResponse.json(
        { error: "invalid_request", users: [] },
        { status: 400 },
      );
    }

    const query = typeof body.query === "string" ? body.query : "";
    const trimmed = query.trim();

    if (!shouldSearchVisibilityUsers(trimmed)) {
      return NextResponse.json(
        {
          error: "invalid_request",
          message: "Введите имя, фамилию, email или UUID",
          users: [],
        },
        { status: 400 },
      );
    }

    const exactLookup = validateVisibilityLookupQuery(trimmed) === null;

    if (exactLookup) {
      const { data, error } = await supabase.rpc(
        "lookup_practice_visibility_user",
        {
          p_practice_id: id,
          p_query: trimmed,
        },
      );

      if (error) {
        console.error("lookup_practice_visibility_user_error", error.message);
        return NextResponse.json(
          { error: "not_found", users: [] },
          { status: 404 },
        );
      }

      const row = Array.isArray(data) ? data[0] : data;

      if (!row?.user_id) {
        return NextResponse.json(
          { error: "not_found", users: [] },
          { status: 404 },
        );
      }

      const hit = mapExactLookupUser(row);

      return NextResponse.json({
        user: {
          userId: row.user_id,
          displayName: row.display_name ?? "Пользователь",
          email:
            isVisibilityLookupEmail(trimmed) && typeof row.email === "string"
              ? row.email
              : null,
        },
        users: hit ? [hit] : [],
      });
    }

    const { data, error } = await supabase.rpc(
      "search_practice_visibility_users",
      {
        p_practice_id: id,
        p_query: trimmed,
      },
    );

    if (error) {
      if (error.message === "rate_limited") {
        return NextResponse.json(
          { error: "rate_limited", users: [] },
          { status: 429 },
        );
      }

      if (
        error.message === "not_authenticated" ||
        error.message === "not_authorized"
      ) {
        return NextResponse.json(
          { error: "forbidden", users: [] },
          { status: 403 },
        );
      }

      console.error("search_practice_visibility_users_error", error.message);
      return NextResponse.json(
        { error: "not_found", users: [] },
        { status: 404 },
      );
    }

    const users = (Array.isArray(data) ? data : [])
      .map((row) =>
        sanitizeVisibilitySearchHit(
          row && typeof row === "object"
            ? (row as Record<string, unknown>)
            : null,
        ),
      )
      .filter((hit): hit is PracticeVisibilitySearchHit => hit !== null)
      .slice(0, 10);

    return NextResponse.json({ users });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
