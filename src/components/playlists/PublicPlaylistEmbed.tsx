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

function itemsCountLabel(count: number): string {
  if (count === 0) {
    return "Нет материалов";
  }

  if (count === 1) {
    return "1 материал";
  }

  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} материал`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} материала`;
  }

  return `${count} материалов`;
}

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
      className="min-w-0 overflow-x-hidden rounded-[22px] border border-[#eadff8] bg-[#faf7ff] px-4 py-4 shadow-[0_8px_22px_rgba(91,62,145,0.05)]"
    >
      <header className="min-w-0">
        <h2 className="text-lg font-semibold leading-6 text-[#25135c] sm:text-xl">
          {playlist.playlist.title}
        </h2>
        {playlist.playlist.description ? (
          <p className="mt-2 text-sm leading-6 text-[#5c4f82]">
            {playlist.playlist.description}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-[#5c4f82]">
          {itemsCountLabel(playlist.itemsCount)}
          {playlist.totalDurationLabel ? ` · ${playlist.totalDurationLabel}` : ""}
        </p>
      </header>

      <PublicPlaylistEmbedPreview
        playlist={playlist}
        sourcePath={sourcePath}
        navigationPolicy={navigationPolicy}
      />
    </section>
  );
}
