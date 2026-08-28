import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeAccess,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { maskVisibilityEmail } from "@/lib/author-products/visibility-users";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeAccess(id);
    const { data, error } = await supabase.rpc("list_practice_visibility_users", {
      p_practice_id: id,
    });

    if (error) {
      console.error("list_practice_visibility_users_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const users = (data ?? []).map((row: {
      user_id?: string;
      display_name?: string;
      first_name?: string | null;
      last_name?: string | null;
      masked_email?: string | null;
      created_at?: string;
    }) => ({
      userId: row.user_id,
      displayName: row.display_name,
      firstName: row.first_name ?? null,
      lastName: row.last_name ?? null,
      maskedEmail: row.masked_email?.includes("***")
        ? row.masked_email
        : maskVisibilityEmail(row.masked_email),
      createdAt: row.created_at,
    }));

    return NextResponse.json({ users });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

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

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const userId =
      "user_id" in body && typeof body.user_id === "string"
        ? body.user_id.trim()
        : "";

    if (!userId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("add_practice_visibility_user", {
      p_practice_id: id,
      p_user_id: userId,
    });

    if (error) {
      if (error.message === "not_found") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }

      console.error("add_practice_visibility_user_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeMutationAccess(id);
    const userId = new URL(request.url).searchParams.get("userId")?.trim() ?? "";

    if (!userId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { error } = await supabase.rpc("remove_practice_visibility_user", {
      p_practice_id: id,
      p_user_id: userId,
    });

    if (error) {
      console.error("remove_practice_visibility_user_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
