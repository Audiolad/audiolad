import Link from "next/link";

import PlaylistCover from "@/components/playlists/PlaylistCover";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import type { PublicPlaylistView } from "@/lib/playlists/public-detail";

type PublicPlaylistPageViewProps = {
  detail: PublicPlaylistView;
  isAuthenticated: boolean;
};

export default function PublicPlaylistPageView({
  detail,
  isAuthenticated,
}: PublicPlaylistPageViewProps) {
  const { playlist, items } = detail;
  const returnPath = `/p/${playlist.slug}`;
  const signInHref = buildAuthRouteHref("/auth/sign-in", returnPath);
  const signUpHref = buildAuthRouteHref("/auth/sign-up", returnPath);

  return (
    <div className="px-5 pt-6 pb-8">
      <p className="text-sm font-medium text-[#7042c5]">Публичный плейлист</p>

      <div className="mx-auto mt-5 w-full max-w-[280px]">
        <PlaylistCover
          title={playlist.title}
          customCoverUrl={detail.coverUrl}
          mosaicCoverUrls={detail.mosaicCoverUrls}
          className="w-full rounded-[28px] shadow-[0_16px_40px_rgba(91,62,145,0.14)]"
          decorative={false}
        />
      </div>

      <h1 className="mt-6 text-[28px] font-semibold leading-8 text-[#25135c]">
        {playlist.title}
      </h1>

      <p className="mt-2 text-sm text-[#7d70a2]">{detail.ownerLabel}</p>

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

      <section className="mt-6 rounded-[22px] border border-[#eadff8] bg-white px-4 py-4 shadow-[0_8px_22px_rgba(91,62,145,0.05)]">
        {isAuthenticated ? (
          <>
            <p className="text-sm leading-6 text-[#5c4f82]">
              Сохраняйте аудиопрактики и собирайте свои плейлисты.
            </p>
            <Link
              href="/my-practices"
              className="mt-3 inline-flex rounded-full bg-[#7042c5] px-5 py-3 text-sm font-medium text-white"
            >
              Перейти в Аудиотеку
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm leading-6 text-[#5c4f82]">
              Сохраняйте аудиопрактики и собирайте свои плейлисты.
            </p>
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
          </>
        )}
      </section>

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
        <section className="mt-7 space-y-3">
          {items.map((item, index) => (
            <article
              key={item.practiceId}
              className="flex gap-3 rounded-[22px] border border-[#eadff8] bg-white p-3 shadow-[0_8px_22px_rgba(91,62,145,0.05)]"
            >
              <div className="flex w-7 shrink-0 items-start justify-center pt-3 text-sm font-medium text-[#8f82ad]">
                {index + 1}
              </div>

              <div className="h-[84px] w-[84px] shrink-0">
                <ProductCoverThumbnail
                  slug={item.practiceId}
                  title={item.title}
                  coverUrl={item.coverDisplayUrl}
                  className="h-full w-full rounded-[18px]"
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <p className="line-clamp-2 text-[16px] font-semibold leading-5 text-[#25135c]">
                  {item.title}
                </p>
                {item.authorName ? (
                  <p className="mt-1 truncate text-sm text-[#25135c]">
                    {item.authorName}
                  </p>
                ) : null}
                {item.metaLabel ? (
                  <p className="mt-1 text-xs text-[#7d70a2]">{item.metaLabel}</p>
                ) : null}
                {!item.available ? (
                  <p className="mt-1 text-xs text-[#b34f63]">
                    Материал сейчас недоступен
                  </p>
                ) : null}

                <div className="mt-auto pt-2">
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="inline-flex items-center gap-2 text-sm font-medium text-[#7042c5]"
                      aria-label={`Слушать: ${item.title}`}
                    >
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7042c5] text-white"
                        aria-hidden
                      >
                        ▶
                      </span>
                      Слушать
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      aria-label={`Сейчас недоступно: ${item.title}`}
                      className="inline-flex items-center gap-2 text-sm font-medium text-[#7042c5] opacity-50"
                    >
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7042c5] text-white"
                        aria-hidden
                      >
                        ▶
                      </span>
                      Сейчас недоступно
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
