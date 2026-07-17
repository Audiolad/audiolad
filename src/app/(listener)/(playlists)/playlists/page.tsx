import PlaylistsClient from "@/components/playlists/PlaylistsClient";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import { listEditorialPlaylists, listOwnedPlaylists } from "@/lib/playlists/queries";
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
    canCreateEditorial = await isPlatformAdmin(supabase, user.id);
  } catch (adminError) {
    console.error("playlists_page_admin_check_error", adminError);
  }

  if (error) {
    console.error("playlists_page_load_error", error);
  }

  return (
    <PlaylistsClient
      playlists={playlists}
      editorialPlaylists={editorialPlaylists}
      canCreateEditorial={canCreateEditorial}
      loadError={Boolean(error)}
    />
  );
}
