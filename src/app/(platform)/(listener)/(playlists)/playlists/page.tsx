import PlaylistsClient from "@/components/playlists/PlaylistsClient";
import { hasPermission } from "@/lib/auth/platform-access";
import {
  listEditablePlatformPlaylists,
  listEditorialPlaylists,
  listOwnedPlaylists,
} from "@/lib/playlists/queries";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { playlists, error } = await listOwnedPlaylists(supabase, {
    userId: user.id,
  });

  const { playlists: editorialPlaylists, error: editorialError } =
    await listEditorialPlaylists(supabase);

  if (editorialError) {
    console.error("playlists_page_editorial_load_error", editorialError);
  }

  let canCreateEditorial = false;

  try {
    canCreateEditorial = await hasPermission(
      supabase,
      user.id,
      "playlists.create_editorial",
    );
  } catch (adminError) {
    console.error("playlists_page_admin_check_error", adminError);
  }

  let canManagePlatform = false;

  try {
    canManagePlatform = await hasPermission(
      supabase,
      user.id,
      "playlists.manage",
    );
  } catch (manageError) {
    console.error("playlists_page_manage_check_error", manageError);
  }

  const { playlists: platformPlaylists, error: platformError } =
    await listEditablePlatformPlaylists(supabase, {
      userId: user.id,
      canManageAll: canManagePlatform,
    });

  if (platformError) {
    console.error("playlists_page_platform_load_error", platformError);
  }

  if (error) {
    console.error("playlists_page_load_error", error);
  }

  const ownedIds = new Set(playlists.map((row) => row.id));
  const mergedPlaylists = [
    ...playlists,
    ...platformPlaylists.filter((row) => !ownedIds.has(row.id)),
  ];

  return (
    <PlaylistsClient
      playlists={mergedPlaylists}
      editorialPlaylists={editorialPlaylists}
      canCreateEditorial={canCreateEditorial}
      loadError={Boolean(error)}
    />
  );
}
