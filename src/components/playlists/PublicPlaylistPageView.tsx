import Link from "next/link";

import PlayAllButton from "@/components/playlists/PlayAllButton";
import PlaylistCover from "@/components/playlists/PlaylistCover";
import PublicPlaylistItems from "@/components/playlists/PublicPlaylistItems";
import { buildAuthRouteHref } from "@/lib/auth/routes";
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
      className="mt-6 rounded-[22px] border border-[#eadff8] bg-white px-4 py-4 shadow-[0_8px_22px_rgba(91,62,145,0.05)]"
      data-public-playlist-library-cta
    >
      <p className="text-sm leading-6 text-[#5c4f82]">
        Сохраняйте аудиопрактики и собирайте свои плейлисты.
      </p>
      {isAuthenticated ? (
        <Link
          href="/my-practices"
          className="mt-3 inline-flex rounded-full bg-[#7042c5] px-5 py-3 text-sm font-medium text-white"
        >
          Перейти в Аудиотеку
        </Link>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={signInHref}
            className="inline-flex rounded-full bg-[#7042c5] px-5 py-3 text-sm font-medium text-white"
          >
            Войти
          </Link>
          <Link
            href={signUpHref}
            className="inline-flex rounded-full border border-[#d9c9f3] bg-white px-5 py-3 text-sm font-medium text-[#7042c5]"
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
      className="pb-[calc(var(--global-mini-player-height,0px)+5.5rem)] xl:pb-0"
      data-public-playlist-page
    >
      <header
        className="flex flex-col xl:grid xl:grid-cols-[minmax(260px,280px)_minmax(0,1fr)] xl:items-start xl:gap-x-6"
        data-public-playlist-hero
      >
        <div
          className="mx-auto mt-5 w-full max-w-[280px] xl:col-start-1 xl:row-start-1 xl:mx-0 xl:mt-0 xl:w-full xl:max-w-none"
          data-public-playlist-hero-cover
        >
          <PlaylistCover
            title={playlist.title}
            customCoverUrl={detail.coverUrl}
            mosaicCoverUrls={detail.mosaicCoverUrls}
            coverAlt={playlistCoverAlt}
            className="w-full rounded-[28px] shadow-[0_16px_40px_rgba(91,62,145,0.14)]"
            decorative={false}
          />
        </div>

        <div
          className="xl:col-start-2 xl:row-start-1 xl:min-w-0"
          data-public-playlist-hero-content
        >
          <h1 className="mt-6 text-[28px] font-semibold leading-8 text-[#25135c] xl:mt-2">
            {playlist.title}
          </h1>

          <p className="mt-2 text-sm text-[#7d70a2]">{detail.ownerLabel}</p>

          {playlist.description ? (
            <p className="mt-3 text-sm leading-6 text-[#5c4f82]">
              {playlist.description}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[#5c4f82]">
            <span>
              {detail.itemsCount === 0
                ? "Нет материалов"
                : detail.itemsCount === 1
                  ? "1 материал"
                  : `${detail.itemsCount} материалов`}
            </span>
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
        <section className="mt-8">
          <p className="text-sm leading-6 text-[#7d70a2]">
            В этом плейлисте пока нет доступных материалов.
          </p>
          <Link
            href="/catalog"
            className="mt-4 inline-flex rounded-full bg-[#7042c5] px-5 py-3 text-sm font-medium text-white"
          >
            Перейти в каталог
          </Link>
        </section>
      ) : null}

      {detail.allUnavailable ? (
        <p className="mt-8 rounded-[18px] border border-[#f0d0d8] bg-[#fff8f9] px-4 py-3 text-sm text-[#b34f63]">
          Материалы этой подборки сейчас недоступны.
        </p>
      ) : null}

      {detail.hasUnavailable && !detail.allUnavailable && detail.itemsCount > 0 ? (
        <p className="mt-8 rounded-[18px] border border-[#eadff8] bg-[#faf7ff] px-4 py-3 text-sm text-[#7d70a2]">
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
