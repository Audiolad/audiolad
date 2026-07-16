import BottomNav from "@/components/BottomNav";
import PlaylistDetailClient from "@/components/playlists/PlaylistDetailClient";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";
import { loadOwnedPlaylistDetail } from "@/lib/playlists/detail";
import { isUuid } from "@/lib/playlists/validation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlaylistDetailPage({ params }: PageProps) {
  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(`/playlists/${id}`)}`);
  }

  const loaded = await loadOwnedPlaylistDetail(supabase, user.id, id);

  if (!loaded.ok && loaded.reason === "not_found") {
    notFound();
  }

  if (!loaded.ok && loaded.reason === "forbidden") {
    redirect("/playlists");
  }

  if (!loaded.ok) {
    return (
      <main className="min-h-screen bg-platform-surface text-[#25135c]">
        <div
          className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}
        >
          <div className="px-5 pt-6 pb-4">
            <Link
              href="/playlists"
              className="text-sm font-medium text-[#7042c5]"
            >
              ← Плейлисты
            </Link>
            <h1 className="mt-6 text-[28px] font-semibold">Плейлист</h1>
            <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
              Не удалось загрузить плейлист. Попробуйте ещё раз.
            </p>
            <Link
              href="/playlists"
              className="mt-6 inline-flex rounded-full bg-[#7042c5] px-5 py-3 text-sm font-medium text-white"
            >
              Вернуться к плейлистам
            </Link>
          </div>
          <BottomNav />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}
      >
        <div className="px-5 pt-6 pb-4">
          <PlaylistDetailClient
            key={`${loaded.detail.playlist.id}:${loaded.detail.playlist.updated_at}`}
            detail={loaded.detail}
          />
        </div>
        <BottomNav />
      </div>
    </main>
  );
}
