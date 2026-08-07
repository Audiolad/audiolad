import { redirect } from "next/navigation";

import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";

export async function requireStudioAuthorAccess(nextPath: string): Promise<void> {
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
}
