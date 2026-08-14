import EditorialPlaylistsListClient from "@/components/playlists/editorial/EditorialPlaylistsListClient";
import { getEditorialWorkspaceAccess } from "@/lib/playlists/editorial-workspace";
import { listEditorialWorkspacePlaylists } from "@/lib/playlists/editorial-workspace-list";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditorialPlaylistsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/editorial/playlists");
  }

  const access = await getEditorialWorkspaceAccess(supabase, user.id);
  const { playlists, error } = await listEditorialWorkspacePlaylists(supabase, {
    userId: user.id,
    canManageAll: access.canManage,
  });

  if (error) {
    console.error("editorial_playlists_page_load_error", error);
  }

  return (
    <EditorialPlaylistsListClient
      playlists={playlists}
      canCreate={access.canCreate}
      loadError={Boolean(error)}
    />
  );
}
