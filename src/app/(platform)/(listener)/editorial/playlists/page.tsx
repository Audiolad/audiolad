import EditorialPlaylistsListClient from "@/components/playlists/editorial/EditorialPlaylistsListClient";
import { listVisibleEditorialDirections } from "@/lib/playlists/editorial-directions";
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
  const [{ playlists, error }, directionsResult] = await Promise.all([
    listEditorialWorkspacePlaylists(supabase, {
      userId: user.id,
      canManageAll: access.canManage,
      directionIds: access.directionIds,
    }),
    listVisibleEditorialDirections(
      supabase,
      access.canManage ? undefined : { ids: access.directionIds },
    ),
  ]);

  if (error) {
    console.error("editorial_playlists_page_load_error", error);
  }

  if (directionsResult.error) {
    console.error(
      "editorial_playlists_page_directions_error",
      directionsResult.error,
    );
  }

  return (
    <EditorialPlaylistsListClient
      playlists={playlists}
      directions={directionsResult.directions}
      canCreate={access.canCreate}
      canManage={access.canManage}
      loadError={Boolean(error)}
    />
  );
}
