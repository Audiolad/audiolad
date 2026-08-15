import { NextResponse } from "next/server";

import { hasPermission } from "@/lib/auth/platform-access";
import {
  directionSlugExists,
  getEditorialDirectionById,
} from "@/lib/playlists/editorial-directions";
import { logEditorialDirectionAudit } from "@/lib/playlists/playlist-access";
import { isUuid, parsePatchDirectionBody } from "@/lib/playlists/validation";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function notFoundResponse() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

async function requireManage(request: Request) {
  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  if (authError) {
    console.error("editorial_direction_auth_error", authError.message);
    return {
      ok: false as const,
      response: NextResponse.json({ error: "internal_error" }, { status: 500 }),
    };
  }

  let canManage = false;

  try {
    canManage = await hasPermission(supabase, user.id, "playlists.manage");
  } catch (error) {
    console.error(
      "editorial_direction_access_error",
      error instanceof Error ? error.message : error,
    );
    return {
      ok: false as const,
      response: NextResponse.json({ error: "internal_error" }, { status: 500 }),
    };
  }

  if (!canManage) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, supabase, user };
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return notFoundResponse();
  }

  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("editorial_direction_get_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { direction, error } = await getEditorialDirectionById(supabase, id);

  if (error) {
    console.error("editorial_direction_get_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!direction) {
    return notFoundResponse();
  }

  return NextResponse.json({ direction });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return notFoundResponse();
  }

  const gate = await requireManage(request);

  if (!gate.ok) {
    return gate.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parsePatchDirectionBody(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { direction, error: loadError } = await getEditorialDirectionById(
    gate.supabase,
    id,
  );

  if (loadError) {
    console.error("editorial_direction_patch_load_error", loadError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!direction) {
    return notFoundResponse();
  }

  if (parsed.slug && parsed.slug !== direction.slug) {
    try {
      if (await directionSlugExists(gate.supabase, parsed.slug, id)) {
        return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
      }
    } catch (error) {
      console.error(
        "editorial_direction_patch_slug_error",
        error instanceof Error ? error.message : error,
      );
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  }

  const updates: Record<string, unknown> = {};

  if (parsed.name !== undefined) {
    updates.name = parsed.name;
  }

  if (parsed.slug !== undefined) {
    updates.slug = parsed.slug;
  }

  const { data, error } = await gate.supabase
    .from("editorial_directions")
    .update(updates)
    .eq("id", id)
    .select("id, name, slug, created_at, updated_at")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
    }

    console.error("editorial_direction_patch_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!data) {
    return notFoundResponse();
  }

  await logEditorialDirectionAudit(gate.supabase, id, "direction_updated", {
    name: parsed.name !== undefined,
    slug: parsed.slug !== undefined,
  });

  return NextResponse.json({ direction: data });
}
