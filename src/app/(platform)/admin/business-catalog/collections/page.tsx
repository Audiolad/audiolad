import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";
import { loadCollectionCatalog } from "@/lib/business-collections/load.server";
import { normalizeCollectionSharePercent } from "@/lib/business-collections/similar-mix.mjs";
import { loadCollectionSimilarPreviews } from "@/lib/business-collections/similar-mix.server";
import { COLLECTION_ADMIN_PATH } from "@/lib/business-collections/model";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import CollectionAdmin, { type CollectionEntry } from "./CollectionAdmin";

export const dynamic = "force-dynamic";

const ACCOUNT_PAGE = 1000;

async function loadUsedCounts(db: ReturnType<typeof createServiceRoleClient>, collectionIds: string[]): Promise<Map<string, number> | null> {
  const usedById = new Map<string, number>();
  if (!collectionIds.length) return usedById;
  for (let from = 0; from <= 20000; from += ACCOUNT_PAGE) {
    const used = await db.from("business_personal_collection_accounts").select("collection_id")
      .in("collection_id", collectionIds)
      .order("collection_id", { ascending: true })
      .order("user_id", { ascending: true })
      .range(from, from + ACCOUNT_PAGE - 1);
    if (used.error || !used.data) return null;
    for (const row of used.data) {
      usedById.set(row.collection_id, (usedById.get(row.collection_id) ?? 0) + 1);
    }
    if (used.data.length < ACCOUNT_PAGE) return usedById;
  }
  return null;
}

export default async function PersonalCollectionsAdminPage() {
  await requirePlatformOwnerAccess(COLLECTION_ADMIN_PATH);
  const db = createServiceRoleClient();
  const [tracks, entries] = await Promise.all([
    loadCollectionCatalog(null),
    db.from("business_personal_collections").select("id,title,revoked_at,created_at,collection_share_percent")
      .order("created_at", { ascending: false }).limit(200),
  ]);
  if (entries.error) throw new Error("Не удалось загрузить подборки.");
  const rows = entries.data ?? [];
  const usedById = await loadUsedCounts(db, rows.map((row) => row.id));
  const catalogTracks = tracks.map((track) => ({
    audioItemId: track.audio_item_id, albumId: track.album_id, title: track.title,
    albumTitle: track.album_title, durationSeconds: track.duration_seconds, coverUrl: "",
  }));
  const itemsByCollection = new Map<string, string[]>();
  if (rows.length) {
    const collectionIds = rows.map((row) => row.id);
    for (let from = 0; from <= 200000; from += ACCOUNT_PAGE) {
      const itemRows = await db.from("business_personal_collection_items").select("collection_id,audio_item_id")
        .in("collection_id", collectionIds)
        .order("collection_id", { ascending: true })
        .order("audio_item_id", { ascending: true })
        .range(from, from + ACCOUNT_PAGE - 1);
      if (itemRows.error || !itemRows.data) throw new Error("Не удалось загрузить треки подборок.");
      for (const row of itemRows.data) {
        const list = itemsByCollection.get(row.collection_id) ?? [];
        list.push(row.audio_item_id);
        itemsByCollection.set(row.collection_id, list);
      }
      if (itemRows.data.length < ACCOUNT_PAGE) break;
      if (from + ACCOUNT_PAGE > 200000) throw new Error("Не удалось загрузить треки подборок.");
    }
  }
  const previews = await loadCollectionSimilarPreviews(rows, catalogTracks, itemsByCollection);
  const collections: CollectionEntry[] = rows.map((row) => {
    const preview = previews.get(row.id);
    return {
      id: row.id,
      title: row.title,
      revoked_at: row.revoked_at,
      created_at: row.created_at,
      usedCount: usedById ? (usedById.get(row.id) ?? 0) : null,
      sharePercent: preview?.sharePercent ?? normalizeCollectionSharePercent(row.collection_share_percent),
      similar: preview?.similar ?? [],
    };
  });
  return <section className="space-y-6">
    <h1 className="text-2xl font-semibold">Персональные подборки Кофейни</h1>
    <p>Записи остаются в общем закрытом каталоге «АудиоЛад Бизнес». Прослушивание по ссылке не запускает подарок.</p>
    <CollectionAdmin collections={collections} tracks={catalogTracks} />
  </section>;
}
