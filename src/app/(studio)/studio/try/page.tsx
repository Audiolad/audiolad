import { redirect } from "next/navigation";

import { resolveStudioActor } from "@/lib/studio/guest-access";
import { listStudioProjectsForGuest } from "@/lib/studio/server/repository";
import { ensureGuestSession } from "@/lib/studio/server/guest-session";

export const dynamic = "force-dynamic";

export default async function StudioTryPage() {
  const actor = await resolveStudioActor();
  if (actor.kind === "author") {
    redirect("/studio/projects");
  }

  const session = await ensureGuestSession();
  const projects = await listStudioProjectsForGuest(session.id);
  if (projects.length === 0) {
    redirect("/studio/project/new?from=try");
  }
  redirect("/studio/projects?from=try");
}
