import AdminMusicTracksTable from "@/components/admin/AdminMusicTracksTable";
import { requireAdminPermission } from "@/lib/admin/guard";
import { listAdminMusicTracks } from "@/lib/admin/music-tracks-queries";

export const dynamic = "force-dynamic";

export default async function AdminMusicTracksPage() {
  await requireAdminPermission("products.view");

  let tracks;

  try {
    tracks = await listAdminMusicTracks();
  } catch (error) {
    console.error("admin_music_tracks_page_error", error);

    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить реестр треков. Попробуйте обновить страницу.
      </div>
    );
  }

  return (
    <section aria-labelledby="admin-music-tracks-heading">
      <div className="mb-5">
        <h2 id="admin-music-tracks-heading" className="text-[21px] font-semibold">
          Реестр треков
        </h2>
        <p className="mt-2 text-sm text-[#796ba0]">
          Все музыкальные треки АудиоЛада и их постоянные Track ID.
        </p>
      </div>

      <AdminMusicTracksTable tracks={tracks} />
    </section>
  );
}
