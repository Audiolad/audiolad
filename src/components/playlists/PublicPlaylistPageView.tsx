import Link from "next/link";

import PlayAllButton from "@/components/playlists/PlayAllButton";
import PlaylistCover from "@/components/playlists/PlaylistCover";
import PublicPlaylistItems from "@/components/playlists/PublicPlaylistItems";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import { formatPlaylistItemCount } from "@/lib/playlists/format-item-count";
import type { PublicPlaylistView } from "@/lib/playlists/public-detail";
import { buildPlaylistCoverAlt } from "@/lib/seo/cover-alt";

type PublicPlaylistPageViewProps = {
  detail: PublicPlaylistView;
  isAuthenticated: boolean;
};

function PublicPlaylistLibraryCta({
  isAuthenticated,
  signInHref,
  signUpHref,
}: {
  isAuthenticated: boolean;
  signInHref: string;
  signUpHref: string;
}) {
  return (
    <section
      className="mt-6 rounded-[28px] border border-[#eadff8] bg-white shadow-[0_12px_30px_rgba(91,62,145,0.08)] p-4 sm:p-5"
      data-public-playlist-library-cta
    >
      <p className="text-sm leading-6 text-[#5c4f82]">
        Сохраняйте аудиопрактики и собирайте свои плейлисты.
      </p>
      {isAuthenticated ? (
        <Link
          href="/my-practices"
          className="mt-3 inline-flex min-h-11 items-center justify-center max-w-full break-words rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] bg-[#7042c5] px-5 py-3 text-sm font-medium text-white"
        >
          Перейти в Аудиотеку
        </Link>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={signInHref}
            className="inline-flex min-h-11 items-center justify-center max-w-full break-words rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] bg-[#7042c5] px-5 py-3 text-sm font-medium text-white"
          >
            Войти
          </Link>
          <Link
            href={signUpHref}
            className="inline-flex min-h-11 items-center justify-center max-w-full break-words rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] border border-[#d9c9f3] bg-white px-5 py-3 text-sm font-medium text-[#7042c5]"
          >
            Создать аккаунт
          </Link>
        </div>
      )}
    </section>
  );
}

export default function PublicPlaylistPageView({
  detail,
  isAuthenticated,
}: PublicPlaylistPageViewProps) {
  const { playlist, items } = detail;
  const returnPath = `/p/${playlist.slug}`;
  const signInHref = buildAuthRouteHref("/auth/sign-in", returnPath);
  const signUpHref = buildAuthRouteHref("/auth/sign-up", returnPath);
  const playlistCoverAlt = buildPlaylistCoverAlt(playlist.title);

  return (
    <div
      className="min-w-0 pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] pb-[calc(var(--global-mini-player-height,0px)+5.5rem+env(safe-area-inset-bottom,0px))] xl:pb-0"
      data-public-playlist-page
    >
      <header
        className="mt-5 min-w-0 rounded-[28px] border border-[#eadff8] bg-white shadow-[0_12px_30px_rgba(91,62,145,0.08)] flex flex-col xl:grid xl:grid-cols-[minmax(260px,280px)_minmax(0,1fr)] xl:items-start xl:gap-x-0"
        data-public-playlist-hero
      >
        <div
          className="w-full min-w-0 xl:col-start-1 xl:row-start-1 xl:w-full"
          data-public-playlist-hero-cover
        >
          <PlaylistCover
            title={playlist.title}
            customCoverUrl={detail.coverUrl}
            mosaicCoverUrls={detail.mosaicCoverUrls}
            coverAlt={playlistCoverAlt}
            className="w-full rounded-t-[27px] xl:rounded-t-none xl:rounded-l-[27px]"
            decorative={false}
          />
        </div>

        <div
          className="min-w-0 p-4 sm:p-5 xl:col-start-2 xl:row-start-1 xl:min-w-0"
          data-public-playlist-hero-content
        >
          <h1 className="break-words text-[24px] font-semibold leading-tight text-[#25135c] [overflow-wrap:anywhere] sm:text-[26px]">
            {playlist.title}
          </h1>

          <p className="mt-2 break-words text-sm leading-6 text-[#7d70a2] [overflow-wrap:anywhere]">{detail.ownerLabel}</p>

          {playlist.description ? (
            <p className="mt-3 break-words text-sm font-medium leading-6 text-[#7042c5] [overflow-wrap:anywhere]">
              {playlist.description}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm leading-6 text-[#7d70a2]">
            <span>{formatPlaylistItemCount(detail.itemsCount)}</span>
            {detail.totalDurationLabel ? (
              <span>· {detail.totalDurationLabel}</span>
            ) : null}
          </div>

          <PlayAllButton
            variant="public"
            playlistSlug={playlist.slug}
            title={playlist.title}
            items={items}
          />
        </div>
      </header>

      {detail.itemsCount === 0 ? (
        <section className="mt-6 rounded-[28px] border border-[#eadff8] bg-white shadow-[0_12px_30px_rgba(91,62,145,0.08)] p-4 sm:p-5">
          <p className="text-sm leading-6 text-[#7d70a2]">
            В этом плейлисте пока нет доступных материалов.
          </p>
          <Link
            href="/catalog"
            className="mt-4 inline-flex min-h-11 items-center justify-center max-w-full break-words rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] bg-[#7042c5] px-5 py-3 text-sm font-medium text-white"
          >
            Перейти в каталог
          </Link>
        </section>
      ) : null}

      {detail.allUnavailable ? (
        <p className="mt-6 rounded-[28px] border border-[#f0d0d8] bg-[#fff8f9] p-4 text-sm leading-6 sm:p-5 text-[#b34f63]">
          Материалы этой подборки сейчас недоступны.
        </p>
      ) : null}

      {detail.hasUnavailable && !detail.allUnavailable && detail.itemsCount > 0 ? (
        <p className="mt-6 rounded-[28px] border border-[#eadff8] bg-[#faf7ff] p-4 text-sm leading-6 sm:p-5 text-[#7d70a2]">
          Некоторые материалы этой подборки сейчас недоступны.
        </p>
      ) : null}

      {items.length > 0 ? (
        <PublicPlaylistItems
          playlistSlug={playlist.slug}
          title={playlist.title}
          items={items}
        />
      ) : null}

      <PublicPlaylistLibraryCta
        isAuthenticated={isAuthenticated}
        signInHref={signInHref}
        signUpHref={signUpHref}
      />
    </div>
  );
}
