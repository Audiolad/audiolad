import { NextResponse } from "next/server";

import {
  canUserManageCollaborators,
  loadPlaylistForAccessCheck,
  logPlaylistAudit,
} from "@/lib/playlists/playlist-access";
import { loadProfileSummaries } from "@/lib/playlists/profile-summaries";
import {
  isUuid,
  parseCollaboratorDeleteBody,
  parseCollaboratorUpsertBody,
} from "@/lib/playlists/validation";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function notFoundResponse() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

async function requireManager(
  request: Request,
  playlistId: string,
) {
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
    console.error("playlist_collaborators_auth_error", authError.message);
    return {
      ok: false as const,
      response: NextResponse.json({ error: "internal_error" }, { status: 500 }),
    };
  }

  const { playlist, error } = await loadPlaylistForAccessCheck(
    supabase,
    playlistId,
  );

  if (error) {
    console.error("playlist_collaborators_load_error", error);
    return {
      ok: false as const,
      response: NextResponse.json({ error: "internal_error" }, { status: 500 }),
    };
  }

  if (!playlist) {
    return { ok: false as const, response: notFoundResponse() };
  }

  const allowed = await canUserManageCollaborators(
    supabase,
    user.id,
    playlist,
  );

  if (!allowed) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, supabase, user, playlist };
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return notFoundResponse();
  }

  const gate = await requireManager(request, id);

  if (!gate.ok) {
    return gate.response;
  }

  const { data, error } = await gate.supabase
    .from("playlist_collaborators")
    .select("user_id, role, added_by, created_at, updated_at")
    .eq("playlist_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("playlist_collaborators_list_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const rows = data ?? [];
  const profileIds = rows.flatMap((row) =>
    [row.user_id, row.added_by].filter(
      (id): id is string => typeof id === "string",
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
      "playlist_collaborators_profiles_error",
      profileError instanceof Error ? profileError.message : profileError,
    );
  }

  return NextResponse.json({
    collaborators: rows.map((row) => {
      const profile = profiles.get(row.user_id);
      const addedBy = row.added_by ? profiles.get(row.added_by) : null;

      return {
        user_id: row.user_id,
        role: row.role,
        added_by: row.added_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
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

  const gate = await requireManager(request, id);

  if (!gate.ok) {
    return gate.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parseCollaboratorUpsertBody(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data, error } = await gate.supabase
    .from("playlist_collaborators")
    .insert({
      playlist_id: id,
      user_id: parsed.userId,
      role: parsed.role,
      added_by: gate.user.id,
    })
    .select("user_id, role, added_by, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "already_exists" }, { status: 409 });
    }

    console.error("playlist_collaborators_insert_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  await logPlaylistAudit(gate.supabase, id, "collaborator_added", {
    user_id: parsed.userId,
    role: parsed.role,
  });

  return NextResponse.json({ collaborator: data }, { status: 201 });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return notFoundResponse();
  }

  const gate = await requireManager(request, id);

  if (!gate.ok) {
    return gate.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parseCollaboratorUpsertBody(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data, error } = await gate.supabase
    .from("playlist_collaborators")
    .update({
      role: parsed.role,
      updated_at: new Date().toISOString(),
    })
    .eq("playlist_id", id)
    .eq("user_id", parsed.userId)
    .select("user_id, role, added_by, created_at, updated_at")
    .maybeSingle();

  if (error) {
    console.error("playlist_collaborators_update_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!data) {
    return notFoundResponse();
  }

  await logPlaylistAudit(gate.supabase, id, "collaborator_role_changed", {
    user_id: parsed.userId,
    role: parsed.role,
  });

  return NextResponse.json({ collaborator: data });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return notFoundResponse();
  }

  const gate = await requireManager(request, id);

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
    .from("playlist_collaborators")
    .delete()
    .eq("playlist_id", id)
    .eq("user_id", parsed.userId)
    .select("user_id")
    .maybeSingle();

  if (error) {
    console.error("playlist_collaborators_delete_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!data) {
    return notFoundResponse();
  }

  await logPlaylistAudit(gate.supabase, id, "collaborator_removed", {
    user_id: parsed.userId,
  });

  return new NextResponse(null, { status: 204 });
}
