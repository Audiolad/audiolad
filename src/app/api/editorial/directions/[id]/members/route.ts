import { NextResponse } from "next/server";

import { hasPermission } from "@/lib/auth/platform-access";
import { getEditorialDirectionById } from "@/lib/playlists/editorial-directions";
import { logEditorialDirectionAudit } from "@/lib/playlists/playlist-access";
import { loadProfileSummaries } from "@/lib/playlists/profile-summaries";
import {
  isUuid,
  parseCollaboratorDeleteBody,
  parseDirectionMemberBody,
} from "@/lib/playlists/validation";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function notFoundResponse() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

async function requireManage(request: Request, directionId: string) {
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
    console.error("editorial_direction_members_auth_error", authError.message);
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
      "editorial_direction_members_access_error",
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

  const { direction, error } = await getEditorialDirectionById(
    supabase,
    directionId,
  );

  if (error) {
    console.error("editorial_direction_members_direction_error", error);
    return {
      ok: false as const,
      response: NextResponse.json({ error: "internal_error" }, { status: 500 }),
    };
  }

  if (!direction) {
    return { ok: false as const, response: notFoundResponse() };
  }

  return { ok: true as const, supabase, user, direction };
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return notFoundResponse();
  }

  const gate = await requireManage(request, id);

  if (!gate.ok) {
    return gate.response;
  }

  const { data, error } = await gate.supabase
    .from("editorial_direction_members")
    .select("user_id, role, added_by, created_at")
    .eq("direction_id", id)
    .eq("role", "direction_editor")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("editorial_direction_members_list_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const rows = data ?? [];
  const profileIds = rows.flatMap((row) =>
    [row.user_id, row.added_by].filter(
      (value): value is string => typeof value === "string",
    ),
  );

  let profiles = new Map<
    string,
    { displayName: string; email: string | null }
  >();

  try {
    const service = createServiceRoleClient();
    profiles = await loadProfileSummaries(service, profileIds);
  } catch (profileError) {
    console.error(
      "editorial_direction_members_profiles_error",
      profileError instanceof Error ? profileError.message : profileError,
    );
  }

  return NextResponse.json({
    members: rows.map((row) => {
      const profile = profiles.get(row.user_id);
      const addedBy = row.added_by ? profiles.get(row.added_by) : null;

      return {
        user_id: row.user_id,
        role: row.role,
        added_by: row.added_by,
        created_at: row.created_at,
        displayName: profile?.displayName ?? "Пользователь",
        email: profile?.email ?? null,
        addedByName: addedBy?.displayName ?? null,
      };
    }),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return notFoundResponse();
  }

  const gate = await requireManage(request, id);

  if (!gate.ok) {
    return gate.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parseDirectionMemberBody(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data, error } = await gate.supabase
    .from("editorial_direction_members")
    .insert({
      direction_id: id,
      user_id: parsed.userId,
      role: "direction_editor",
      added_by: gate.user.id,
    })
    .select("user_id, role, added_by, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "already_exists" }, { status: 409 });
    }

    console.error("editorial_direction_members_insert_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  await logEditorialDirectionAudit(gate.supabase, id, "direction_editor_added", {
    user_id: parsed.userId,
  });

  return NextResponse.json({ member: data }, { status: 201 });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return notFoundResponse();
  }

  const gate = await requireManage(request, id);

  if (!gate.ok) {
    return gate.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parseCollaboratorDeleteBody(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data, error } = await gate.supabase
    .from("editorial_direction_members")
    .delete()
    .eq("direction_id", id)
    .eq("user_id", parsed.userId)
    .select("user_id")
    .maybeSingle();

  if (error) {
    console.error("editorial_direction_members_delete_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!data) {
    return notFoundResponse();
  }

  await logEditorialDirectionAudit(
    gate.supabase,
    id,
    "direction_editor_removed",
    { user_id: parsed.userId },
  );

  return new NextResponse(null, { status: 204 });
}
