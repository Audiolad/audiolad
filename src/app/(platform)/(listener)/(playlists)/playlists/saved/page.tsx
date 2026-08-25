import PlaylistGrid from "@/components/playlists/catalog/PlaylistGrid";
import PlaylistLibraryNav from "@/components/playlists/PlaylistLibraryNav";
import SavedPlaylistsEmpty from "@/components/playlists/SavedPlaylistsEmpty";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import { loadPlaylistSavedPage } from "@/lib/playlists/saved-page";
import {
  buildPlaylistSavedListingApiUrl,
  PLAYLIST_SAVED_SIGN_IN_RETURN_PATH,
} from "@/lib/playlists/saved-listing";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PlaylistSavedPageProps = {
  searchParams: Promise<{
    cursor?: string;
    limit?: string;
  }>;
};

export default async function PlaylistSavedPage({
  searchParams,
}: PlaylistSavedPageProps) {
  const params = await searchParams;
  const { userId, query, listing } = await loadPlaylistSavedPage(params);

  if (!userId) {
    redirect(
      buildAuthRouteHref("/auth/sign-in", PLAYLIST_SAVED_SIGN_IN_RETURN_PATH),
    );
  }

  return (
    <>
      <header>
        <h1 className="text-[28px] font-semibold">Сохранённые</h1>
        <p className="mt-1 text-sm text-[#7d70a2]">
          Публичные плейлисты, которые вы сохранили
        </p>
        <PlaylistLibraryNav active="saved" />
      </header>

      {listing.items.length === 0 ? (
        <SavedPlaylistsEmpty />
      ) : (
        <PlaylistGrid
          items={listing.items}
          nextCursor={listing.nextCursor}
          query={{
            q: "",
            topic: null,
            access: "all",
            sort: "newest",
            limit: query.limit,
          }}
          buildApiUrl={buildPlaylistSavedListingApiUrl}
          ariaLabel="Сохранённые плейлисты"
          removeUnsaved
          emptyContent={<SavedPlaylistsEmpty />}
          isAuthenticated
          signInReturnPath={PLAYLIST_SAVED_SIGN_IN_RETURN_PATH}
        />
      )}
    </>
  );
}
