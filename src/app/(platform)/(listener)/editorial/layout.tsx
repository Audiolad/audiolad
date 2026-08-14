import { notFound, redirect } from "next/navigation";

import { getEditorialWorkspaceAccess } from "@/lib/playlists/editorial-workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditorialLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/editorial/playlists");
  }

  const access = await getEditorialWorkspaceAccess(supabase, user.id);

  if (!access.hasAccess) {
    notFound();
  }

  return children;
}
