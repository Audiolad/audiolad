import { redirect } from "next/navigation";

import {
  listAuthorWorkspacesForUser,
} from "@/lib/author-products/auth";
import type { AuthorWorkspace } from "@/lib/author-products/types";
import { createClient } from "@/lib/supabase/server";

export async function requireStudioAuthorAccess(
  nextPath: string,
): Promise<[AuthorWorkspace, ...AuthorWorkspace[]]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?next=${nextPath}`);
  }

  const workspaces = await listAuthorWorkspacesForUser(user.id);

  if (workspaces.length === 0) {
    redirect("/author-dashboard");
  }

  return workspaces as [AuthorWorkspace, ...AuthorWorkspace[]];
}
