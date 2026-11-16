import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { StudioActor } from "../guest-access";
import { pickStudioHomeWorkspaceId } from "../home-workspace";

export async function resolveStudioHomeAuthorId(
  actor: StudioActor,
): Promise<string | undefined> {
  if (actor.kind !== "author") {
    return undefined;
  }
  const workspaceIds = actor.workspaces.map((workspace) => workspace.id);
  if (workspaceIds.length === 1) {
    return workspaceIds[0];
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("studio_projects")
    .select("author_id, updated_at")
    .in("author_id", workspaceIds)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("studio_home_workspace_error", error.message);
    return workspaceIds[0];
  }

  return pickStudioHomeWorkspaceId(
    workspaceIds,
    (data ?? []).map((row) => ({
      authorId: row.author_id as string,
      latestActivityAt: (row.updated_at as string | null) ?? null,
    })),
  );
}
