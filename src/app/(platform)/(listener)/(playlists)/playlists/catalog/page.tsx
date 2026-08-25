import PlaylistGrid from "@/components/playlists/catalog/PlaylistGrid";
import { loadPlaylistCatalogPage } from "@/lib/playlists/catalog-page";

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
  const { query, listing } = await loadPlaylistCatalogPage(params);

  return (
    <>
      <h1 className="sr-only text-[28px] font-semibold xl:not-sr-only xl:block">
        Каталог плейлистов
      </h1>

      {listing.items.length === 0 ? (
        <section className="mt-8">
          <p className="text-[15px] font-medium text-[#5f3f9d]">
            Пока нет плейлистов в витрине.
          </p>
        </section>
      ) : (
        <PlaylistGrid
          items={listing.items}
          nextCursor={listing.nextCursor}
          query={query}
        />
      )}
    </>
  );
}
