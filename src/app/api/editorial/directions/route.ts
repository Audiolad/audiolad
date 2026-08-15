import { NextResponse } from "next/server";

import { hasPermission } from "@/lib/auth/platform-access";
import {
  directionSlugExists,
  listEditorialDirectionsForManage,
  listVisibleEditorialDirections,
} from "@/lib/playlists/editorial-directions";
import { getEditorialWorkspaceAccess } from "@/lib/playlists/editorial-workspace";
import { logEditorialDirectionAudit } from "@/lib/playlists/playlist-access";
import { parseCreateDirectionBody } from "@/lib/playlists/validation";
import { createClientFromRequest } from "@/lib/supabase/request-client";

export async function GET(request: Request) {
  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("editorial_directions_list_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const access = await getEditorialWorkspaceAccess(supabase, user.id);

  if (!access.hasAccess) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (access.canManageDirections) {
    const { directions, error } = await listEditorialDirectionsForManage(supabase);

    if (error) {
      console.error("editorial_directions_list_error", error);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({ directions });
  }

  const { directions, error } = await listVisibleEditorialDirections(supabase, {
    ids: access.directionIds,
  });

  if (error) {
    console.error("editorial_directions_visible_list_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({
    directions: directions.map((row) => ({
      ...row,
      playlistCount: 0,
      editors: [],
    })),
  });
}

export async function POST(request: Request) {
  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("editorial_directions_create_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let canManage = false;

  try {
    canManage = await hasPermission(supabase, user.id, "playlists.manage");
  } catch (error) {
    console.error(
      "editorial_directions_create_access_error",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!canManage) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parseCreateDirectionBody(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    if (await directionSlugExists(supabase, parsed.slug)) {
      return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
    }
  } catch (error) {
    console.error(
      "editorial_directions_create_slug_error",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("editorial_directions")
    .insert({
      name: parsed.name,
      slug: parsed.slug,
    })
    .select("id, name, slug, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
    }

    console.error("editorial_directions_create_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  await logEditorialDirectionAudit(supabase, data.id, "direction_created", {
    name: parsed.name,
    slug: parsed.slug,
  });

  return NextResponse.json({ direction: data }, { status: 201 });
}
