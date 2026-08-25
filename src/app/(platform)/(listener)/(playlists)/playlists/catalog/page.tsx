import Link from "next/link";

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

/**
 * Stage 2 data check only. Final card/grid/filters/play live in
 * src/lib/playlists/catalog-ui-homes.ts and must not be implemented here.
 */
export default async function PlaylistCatalogPage({
  searchParams,
}: PlaylistCatalogPageProps) {
  const params = await searchParams;
  const { listing } = await loadPlaylistCatalogPage(params);

  return (
    <main>
      <h1>Каталог плейлистов</h1>
      {listing.items.length === 0 ? (
        <p>Пока нет плейлистов в витрине.</p>
      ) : (
        <ul>
          {listing.items.map((item) => (
            <li key={item.id}>
              <Link href={item.href}>{item.title}</Link>
              {" — "}
              {item.creator}
              {" — "}
              {item.trackCount} треков
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
