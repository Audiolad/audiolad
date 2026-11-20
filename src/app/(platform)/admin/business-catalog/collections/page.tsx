import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";
import { loadCollectionCatalog } from "@/lib/business-collections/load.server";
import { COLLECTION_ADMIN_PATH } from "@/lib/business-collections/model";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import CollectionAdmin, { type CollectionEntry } from "./CollectionAdmin";

export const dynamic = "force-dynamic";

export default async function PersonalCollectionsAdminPage() {
  await requirePlatformOwnerAccess(COLLECTION_ADMIN_PATH);
  const db = createServiceRoleClient();
  const [tracks, entries] = await Promise.all([
    loadCollectionCatalog(null),
    db.from("business_personal_collections").select("id,title,revoked_at,created_at")
      .order("created_at", { ascending: false }).limit(200),
  ]);
  if (entries.error) throw new Error("Не удалось загрузить подборки.");
  const rows = entries.data ?? [];
  const usedById = new Map<string, number>();
  let usedOk = false;
  if (rows.length) {
    const used = await db.from("business_personal_collection_accounts").select("collection_id")
      .in("collection_id", rows.map((row) => row.id));
    if (!used.error && used.data) {
      usedOk = true;
      for (const row of used.data) {
        usedById.set(row.collection_id, (usedById.get(row.collection_id) ?? 0) + 1);
      }
    }
  }
  const collections: CollectionEntry[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
    usedCount: usedOk ? (usedById.get(row.id) ?? 0) : null,
  }));
  return <section className="space-y-6">
    <h1 className="text-2xl font-semibold">Персональные подборки Кофейни</h1>
    <p>Записи остаются в общем закрытом каталоге «АудиоЛад Бизнес». Прослушивание по ссылке не запускает подарок.</p>
    <CollectionAdmin collections={collections} tracks={tracks.map((track) => ({
      audioItemId: track.audio_item_id, albumId: track.album_id, title: track.title,
      albumTitle: track.album_title, durationSeconds: track.duration_seconds, coverUrl: "",
    }))} />
  </section>;
}
