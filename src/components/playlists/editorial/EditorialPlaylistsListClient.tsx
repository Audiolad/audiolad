"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import PlaylistCover from "@/components/playlists/PlaylistCover";
import { formatEditorialUpdatedAt } from "@/lib/playlists/editorial-workspace";
import type {
  EditorialDirectionRow,
  EditorialWorkspaceListItem,
} from "@/lib/playlists/types";

type EditorialPlaylistsListClientProps = {
  playlists: EditorialWorkspaceListItem[];
  directions: EditorialDirectionRow[];
  canCreate: boolean;
  canManage: boolean;
  loadError: boolean;
};

type StatusFilter = "all" | "draft" | "published";

const COVER_GRADIENTS = [
  "from-[#f5d7e7] to-[#bd91df]",
  "from-[#d9c9f3] to-[#8f73cd]",
  "from-[#f4d6aa] to-[#d399c9]",
  "from-[#6870b7] to-[#c9b7ea]",
];

function coverGradientForId(id: string): string {
  let hash = 0;

  for (let i = 0; i < id.length; i += 1) {
    hash = (hash + id.charCodeAt(i) * (i + 1)) % COVER_GRADIENTS.length;
  }

  return COVER_GRADIENTS[hash] ?? COVER_GRADIENTS[0];
}

function formatItemsCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} позиция`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} позиции`;
  }

  return `${count} позиций`;
}

function formatAuthorsCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} автор`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} автора`;
  }

  return `${count} авторов`;
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function EditorialPlaylistsListClient({
  playlists,
  directions,
  canCreate,
  canManage,
  loadError,
}: EditorialPlaylistsListClientProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [directionFilter, setDirectionFilter] = useState<string>(
    !canManage && directions.length === 1 ? directions[0].id : "all",
  );

  const showDirectionSwitcher = canManage || directions.length > 1;
  const hasLegacyWithoutDirection = playlists.some(
    (playlist) => !playlist.direction_id,
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return playlists.filter((playlist) => {
      const isPublished = playlist.visibility === "public";

      if (statusFilter === "draft" && isPublished) {
        return false;
      }

      if (statusFilter === "published" && !isPublished) {
        return false;
      }

      if (directionFilter === "none" && playlist.direction_id) {
        return false;
      }

      if (
        directionFilter !== "all" &&
        directionFilter !== "none" &&
        playlist.direction_id !== directionFilter
      ) {
        return false;
      }

      if (!normalized) {
        return true;
      }

      return (
        playlist.title.toLowerCase().includes(normalized) ||
        (playlist.slug ?? "").toLowerCase().includes(normalized) ||
        (playlist.directionName ?? "").toLowerCase().includes(normalized)
      );
    });
  }, [playlists, query, statusFilter, directionFilter]);

  return (
    <div className="px-5 pb-10 pt-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold">Открытые плейлисты</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#7d70a2]">
            Редакционные подборки Аудиолада для страниц прослушивания и других
            поверхностей платформы.
          </p>
        </div>

        {canCreate ? (
          <Link
            href="/editorial/playlists/new"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white"
          >
            <PlusIcon />
            Создать плейлист
          </Link>
        ) : null}
      </header>

      <div className="mt-6 space-y-3">
        <label className="block">
          <span className="sr-only">Поиск по названию</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию"
            className="w-full rounded-[18px] border border-[#ddcfef] px-4 py-3 text-sm outline-none focus:border-[#7042c5]"
          />
        </label>

        {showDirectionSwitcher ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Направление">
            <button
              type="button"
              onClick={() => setDirectionFilter("all")}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                directionFilter === "all"
                  ? "bg-[#7042c5] text-white"
                  : "border border-[#ddcfef] bg-white text-[#7042c5]"
              }`}
            >
              Все направления
            </button>
            {directions.map((direction) => (
              <button
                key={direction.id}
                type="button"
                onClick={() => setDirectionFilter(direction.id)}
                className={`rounded-full px-4 py-2 text-sm font-medium ${
                  directionFilter === direction.id
                    ? "bg-[#7042c5] text-white"
                    : "border border-[#ddcfef] bg-white text-[#7042c5]"
                }`}
              >
                {direction.name}
              </button>
            ))}
            {canManage && hasLegacyWithoutDirection ? (
              <button
                type="button"
                onClick={() => setDirectionFilter("none")}
                className={`rounded-full px-4 py-2 text-sm font-medium ${
                  directionFilter === "none"
                    ? "bg-[#7042c5] text-white"
                    : "border border-[#ddcfef] bg-white text-[#7042c5]"
                }`}
              >
                Без направления
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2" role="group" aria-label="Статус">
          {(
            [
              ["all", "Все"],
              ["draft", "Draft"],
              ["published", "Опубликован"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                statusFilter === value
                  ? "bg-[#7042c5] text-white"
                  : "border border-[#ddcfef] bg-white text-[#7042c5]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loadError ? (
        <section className="mt-8 rounded-[24px] border border-[#eadff8] bg-white px-5 py-8 text-center">
          <p className="text-[16px] font-medium">
            Не удалось загрузить плейлисты. Попробуйте ещё раз.
          </p>
        </section>
      ) : null}

      {!loadError && filtered.length === 0 ? (
        <section className="mt-8 rounded-[24px] border border-dashed border-[#d4c2eb] bg-[#faf6ff] px-5 py-10 text-center">
          <p className="text-[18px] font-semibold">Пока нет плейлистов</p>
          <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
            {query || statusFilter !== "all" || directionFilter !== "all"
              ? "Ничего не найдено. Измените поиск или фильтр."
              : "Создайте редакционную подборку для платформы."}
          </p>
        </section>
      ) : null}

      {!loadError && filtered.length > 0 ? (
        <div className="mt-6 space-y-5">
          {filtered.map((playlist) => {
            const published = playlist.visibility === "public";

            return (
              <article
                key={playlist.id}
                className="rounded-[26px] border border-[#eadff8] bg-white p-4 shadow-[0_10px_28px_rgba(91,62,145,0.07)]"
              >
                <div className="flex gap-4">
                  <Link
                    href={`/editorial/playlists/${playlist.id}`}
                    className="block h-[96px] w-[96px] shrink-0 overflow-hidden rounded-[22px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] sm:h-[118px] sm:w-[118px]"
                    aria-label={`Открыть плейлист ${playlist.title}`}
                  >
                    <PlaylistCover
                      title={playlist.title}
                      customCoverUrl={playlist.coverUrl}
                      mosaicCoverUrls={playlist.mosaicCoverUrls}
                      gradientClassName={`bg-gradient-to-br ${coverGradientForId(playlist.id)}`}
                      className="h-full w-full rounded-[22px]"
                    />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/editorial/playlists/${playlist.id}`}
                      className="min-w-0 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                    >
                      <p className="text-[18px] font-semibold leading-6">
                        {playlist.title}
                      </p>
                      {playlist.directionName ? (
                        <p className="mt-1 truncate text-sm text-[#7d70a2]">
                          {playlist.directionName}
                        </p>
                      ) : null}
                      <p className="mt-1 truncate text-sm text-[#7d70a2]">
                        {playlist.slug
                          ? `Адрес плейлиста: ${playlist.slug}`
                          : "Адрес плейлиста не задан"}
                      </p>
                      <p className="mt-2 text-sm font-medium text-[#7042c5]">
                        {published ? "Опубликован" : "Draft"}
                      </p>
                      <p className="mt-1 text-sm text-[#7d70a2]">
                        {formatItemsCount(playlist.items_count)} ·{" "}
                        {formatAuthorsCount(playlist.unique_author_count)}
                      </p>
                      <p className="mt-1 text-sm text-[#7d70a2]">
                        Обновлён {formatEditorialUpdatedAt(playlist.updated_at)}
                        {playlist.creatorName
                          ? ` · создал ${playlist.creatorName}`
                          : ""}
                      </p>
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
