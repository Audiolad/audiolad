import PlaylistCover from "@/components/playlists/PlaylistCover";
import PlayAllButton from "@/components/playlists/PlayAllButton";
import PublicPlaylistEmbedPreview from "@/components/playlists/PublicPlaylistEmbedPreview";
import { loadPublicPlaylistBySlug } from "@/lib/playlists/public-detail";
import type { PublicPlaylistView } from "@/lib/playlists/public-detail";
import type { PlaylistQueueNavigationPolicy } from "@/lib/playlists/player-queue-types";

type PublicPlaylistEmbedProps = {
  sourcePath: string;
  navigationPolicy?: PlaylistQueueNavigationPolicy;
} & (
  | { playlist: PublicPlaylistView; playlistSlug?: never }
  | { playlistSlug: string; playlist?: never }
);

const LISTEN_EMBED_EYEBROW = "СЛУШАЙТЕ ПРЯМО СЕЙЧАС";
const LISTEN_EMBED_SHORT_COPY =
  "Слушайте всё сразу или начните с любой строки.";

export default async function PublicPlaylistEmbed({
  playlist: playlistProp,
  playlistSlug,
  sourcePath,
  navigationPolicy = "stay_on_source",
}: PublicPlaylistEmbedProps) {
  let playlist = playlistProp ?? null;

  if (!playlist && playlistSlug) {
    const loaded = await loadPublicPlaylistBySlug(playlistSlug);

    if (!loaded.ok) {
      return null;
    }

    playlist = loaded.detail;
  }

  if (!playlist || playlist.items.length === 0) {
    return null;
  }

  return (
    <section
      data-public-playlist-embed
      data-playlist-slug={playlist.playlist.slug}
      className="max-w-[40rem] min-w-0 overflow-hidden rounded-[28px] border border-[#eadff8] bg-white shadow-[0_12px_30px_rgba(91,62,145,0.08)]"
    >
      <div className="sm:flex sm:items-start sm:gap-4 sm:p-4">
        <div className="w-full sm:w-[152px] sm:shrink-0">
          <PlaylistCover
            title={playlist.playlist.title}
            customCoverUrl={playlist.coverUrl}
            mosaicCoverUrls={playlist.mosaicCoverUrls}
            decorative={false}
            className="w-full"
          />
        </div>
        <header className="p-4 sm:min-w-0 sm:flex-1 sm:p-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7042c5]">
            {LISTEN_EMBED_EYEBROW}
          </p>
          <h2 className="mt-2 text-lg font-semibold leading-6 text-[#25135c] sm:text-xl">
            {playlist.playlist.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#5c4f82]">
            {LISTEN_EMBED_SHORT_COPY}
          </p>
          <PlayAllButton
            variant="public"
            playlistSlug={playlist.playlist.slug}
            title={playlist.playlist.title}
            items={playlist.items}
            startIndex={0}
            returnHref={sourcePath}
            navigationPolicy={navigationPolicy}
          />
        </header>
      </div>

      <div className="px-4 pb-4">
        <PublicPlaylistEmbedPreview
          playlist={playlist}
          sourcePath={sourcePath}
          navigationPolicy={navigationPolicy}
        />
      </div>
    </section>
  );
}
