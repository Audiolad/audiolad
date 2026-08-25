import PlaylistCatalogSearch from "@/components/playlists/catalog/PlaylistCatalogSearch";
import PlaylistGrid from "@/components/playlists/catalog/PlaylistGrid";
import { loadPlaylistCatalogPage } from "@/lib/playlists/catalog-page";
import { PLAYLIST_CATALOG_SIGN_IN_RETURN_PATH } from "@/lib/playlists/catalog-save";
import { resolvePlaylistCatalogActiveTopicKey } from "@/lib/playlists/listing-filters";

export const dynamic = "force-dynamic";

type PlaylistCatalogPageProps = {
  searchParams: Promise<{
    q?: string;
    topic?: string;
    access?: string;
    sort?: string;
    cursor?: string;
    limit?: string;
  }>;
};

export default async function PlaylistCatalogPage({
  searchParams,
}: PlaylistCatalogPageProps) {
  const params = await searchParams;
  const { query, listing, isAuthenticated } =
    await loadPlaylistCatalogPage(params);
  const isSearchActive = query.q.length > 0;
  const activeTopicKey = resolvePlaylistCatalogActiveTopicKey(query.topic);

  return (
    <>
      <h1 className="sr-only">Каталог плейлистов</h1>

      <PlaylistCatalogSearch
        query={query.q}
        sort={query.sort}
        topic={activeTopicKey}
      />

      {listing.items.length === 0 ? (
        <section className="mt-8">
          <p className="text-[15px] font-medium text-[#5f3f9d]">
            {activeTopicKey
              ? "В этой теме пока нет плейлистов."
              : isSearchActive
                ? "Ничего не нашлось"
                : "Пока нет плейлистов в витрине."}
          </p>
        </section>
      ) : (
        <PlaylistGrid
          key={`${query.q}:${query.sort}:${activeTopicKey ?? ""}`}
          items={listing.items}
          nextCursor={listing.nextCursor}
          query={query}
          isAuthenticated={isAuthenticated}
          signInReturnPath={PLAYLIST_CATALOG_SIGN_IN_RETURN_PATH}
        />
      )}
    </>
  );
}
