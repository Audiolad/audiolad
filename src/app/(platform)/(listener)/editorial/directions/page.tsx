import { notFound, redirect } from "next/navigation";

import EditorialDirectionsListClient from "@/components/playlists/editorial/EditorialDirectionsListClient";
import { listEditorialDirectionsForManage } from "@/lib/playlists/editorial-directions";
import { getEditorialWorkspaceAccess } from "@/lib/playlists/editorial-workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditorialDirectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/editorial/directions");
  }

  const access = await getEditorialWorkspaceAccess(supabase, user.id);

  if (!access.canManageDirections) {
    notFound();
  }

  const { directions, error } = await listEditorialDirectionsForManage(supabase);

  if (error) {
    console.error("editorial_directions_page_load_error", error);
  }

  return (
    <EditorialDirectionsListClient
      directions={directions}
      loadError={Boolean(error)}
    />
  );
}
