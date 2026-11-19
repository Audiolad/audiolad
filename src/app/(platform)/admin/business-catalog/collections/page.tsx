import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";
import { loadCollectionCatalog } from "@/lib/business-collections/load.server";
import { COLLECTION_ADMIN_PATH } from "@/lib/business-collections/model";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import CollectionAdmin from "./CollectionAdmin";

export const dynamic = "force-dynamic";
export default async function PersonalCollectionsAdminPage() {
  await requirePlatformOwnerAccess(COLLECTION_ADMIN_PATH);
  const [tracks, entries] = await Promise.all([
    loadCollectionCatalog(null),
    createServiceRoleClient().from("business_personal_collections").select("id,title,revoked_at")
      .order("created_at", { ascending: false }).limit(200),
  ]);
  if (entries.error) throw new Error("Не удалось загрузить подборки.");
  return <section className="space-y-6">
    <h1 className="text-2xl font-semibold">Персональные подборки Кофейни</h1>
    <p>Записи остаются в общем закрытом каталоге «АудиоЛад Бизнес». Прослушивание по ссылке не запускает подарок.</p>
    <CollectionAdmin collections={entries.data ?? []} tracks={tracks.map((track) => ({
      audioItemId: track.audio_item_id, albumId: track.album_id, title: track.title,
      albumTitle: track.album_title, durationSeconds: track.duration_seconds, coverUrl: "",
    }))} />
  </section>;
}
