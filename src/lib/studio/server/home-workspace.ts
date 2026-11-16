import "server-only";

import { cookies } from "next/headers";

import type { AuthorWorkspace } from "@/lib/author-products/types";
import { AUTHOR_PROJECT_COOKIE } from "@/lib/author-projects/constants";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { StudioActor } from "../guest-access";
import {
  needsLatestProjectLookup,
  pickStudioWorkspace,
  type StudioHomeWorkspaceCandidate,
} from "../home-workspace";

async function readCookieSlug(): Promise<string | null> {
  const raw = (await cookies()).get(AUTHOR_PROJECT_COOKIE)?.value ?? null;
  if (!raw) {
    return null;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function loadLatestProjectCandidates(
  workspaceIds: string[],
): Promise<StudioHomeWorkspaceCandidate[]> {
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
    return [];
  }

  return (data ?? []).map((row) => ({
    authorId: row.author_id as string,
    latestActivityAt: (row.updated_at as string | null) ?? null,
  }));
}

/** Author workspace the studio project list / creator works in (see pickStudioWorkspace). */
export async function resolveStudioHomeWorkspace(
  actor: StudioActor,
  querySlug?: string | null,
): Promise<AuthorWorkspace | undefined> {
  if (actor.kind !== "author") {
    return undefined;
  }
  const workspaces = actor.workspaces;
  const cookieSlug = await readCookieSlug();
  const candidates = needsLatestProjectLookup(workspaces, querySlug, cookieSlug)
    ? await loadLatestProjectCandidates(workspaces.map((workspace) => workspace.id))
    : [];
  return pickStudioWorkspace(workspaces, { querySlug, cookieSlug, candidates });
}
