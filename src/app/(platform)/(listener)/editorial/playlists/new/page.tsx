import { notFound, redirect } from "next/navigation";

import EditorialPlaylistCreateClient from "@/components/playlists/editorial/EditorialPlaylistCreateClient";
import { getEditorialWorkspaceAccess } from "@/lib/playlists/editorial-workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditorialPlaylistNewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/editorial/playlists/new");
  }

  const access = await getEditorialWorkspaceAccess(supabase, user.id);

  if (!access.canCreate) {
    notFound();
  }

  return <EditorialPlaylistCreateClient />;
}
