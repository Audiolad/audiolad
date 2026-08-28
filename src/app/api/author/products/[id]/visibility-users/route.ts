import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeAccess,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeAccess(id);
    const { callAuthorUserRpc } = await import("@/lib/author-support/context");
    const { data, error } = await callAuthorUserRpc<
      {
        user_id?: string;
        display_name?: string;
        created_at?: string;
      }[]
    >(supabase, "list_practice_visibility_users", { p_practice_id: id });

    if (error) {
      console.error("list_practice_visibility_users_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const users = (data ?? []).map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
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

    const { callAuthorUserRpc } = await import("@/lib/author-support/context");
    const { data, error } = await callAuthorUserRpc(
      supabase,
      "add_practice_visibility_user",
      {
        p_practice_id: id,
        p_user_id: userId,
      },
    );

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

    const { callAuthorUserRpc } = await import("@/lib/author-support/context");
    const { error } = await callAuthorUserRpc(
      supabase,
      "remove_practice_visibility_user",
      {
        p_practice_id: id,
        p_user_id: userId,
      },
    );

    if (error) {
      console.error("remove_practice_visibility_user_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
