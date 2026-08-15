import { notFound, redirect } from "next/navigation";

import EditorialPlaylistCreateClient from "@/components/playlists/editorial/EditorialPlaylistCreateClient";
import { listVisibleEditorialDirections } from "@/lib/playlists/editorial-directions";
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

  const { directions, error } = await listVisibleEditorialDirections(
    supabase,
    access.canManage ? undefined : { ids: access.directionIds },
  );

  if (error) {
    console.error("editorial_playlist_new_directions_error", error);
  }

  return <EditorialPlaylistCreateClient directions={directions} />;
}
