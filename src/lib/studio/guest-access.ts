import { redirect } from "next/navigation";

import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import type { AuthorWorkspace } from "@/lib/author-products/types";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

import {
  getGuestSession,
  touchGuestSession,
  type StudioGuestSession,
} from "./server/guest-session";

export type StudioActor =
  | { kind: "author"; workspaces: [AuthorWorkspace, ...AuthorWorkspace[]] }
  | { kind: "guest"; session: StudioGuestSession }
  | { kind: "none" };

export type StudioEditorActor = Exclude<StudioActor, { kind: "none" }>;

export async function resolveStudioActor(): Promise<StudioActor> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const workspaces = await listAuthorWorkspacesForUser(user.id);
    if (workspaces.length > 0) {
      return {
        kind: "author",
        workspaces: workspaces as [AuthorWorkspace, ...AuthorWorkspace[]],
      };
    }
  }

  const session = await getGuestSession();
  if (session) {
    await touchGuestSession(session.id);
    return { kind: "guest", session };
  }

  return { kind: "none" };
}

export async function requireStudioEditorAccess(
  nextPath: string,
): Promise<StudioEditorActor> {
  const actor = await resolveStudioActor();
  if (actor.kind === "none") {
    redirect(buildAuthRouteHref("/auth/sign-in", nextPath));
  }
  return actor;
}

export function studioActorAuthorIds(actor: StudioActor): string[] {
  return actor.kind === "author" ? actor.workspaces.map((workspace) => workspace.id) : [];
}

export function toStudioActorView(actor: StudioActor) {
  if (actor.kind === "author") {
    return { kind: "author" as const, authorIds: studioActorAuthorIds(actor) };
  }
  if (actor.kind === "guest") {
    return { kind: "guest" as const, sessionId: actor.session.id };
  }
  return { kind: "none" as const };
}
