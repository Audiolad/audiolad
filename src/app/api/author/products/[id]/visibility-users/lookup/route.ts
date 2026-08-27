import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { validateVisibilityLookupQuery } from "@/lib/author-products/visibility-users";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeMutationAccess(id);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (!body || typeof body !== "object" || !("query" in body)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const query = typeof body.query === "string" ? body.query : "";
    const validationError = validateVisibilityLookupQuery(query);

    if (validationError) {
      return NextResponse.json(
        { error: "invalid_request", message: validationError },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc(
      "lookup_practice_visibility_user",
      {
        p_practice_id: id,
        p_query: query.trim(),
      },
    );

    if (error) {
      console.error("lookup_practice_visibility_user_error", error.message);
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row?.user_id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        userId: row.user_id,
        displayName: row.display_name ?? "Пользователь",
        email: typeof row.email === "string" ? row.email : null,
      },
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
