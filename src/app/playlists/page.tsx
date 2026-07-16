import BottomNav from "@/components/BottomNav";
import PlaylistsClient from "@/components/playlists/PlaylistsClient";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";
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
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}
      >
        <div className="px-5 pt-6 pb-4">
          <PlaylistsClient
            playlists={playlists}
            editorialPlaylists={editorialPlaylists}
            canCreateEditorial={canCreateEditorial}
            loadError={Boolean(error)}
          />
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
