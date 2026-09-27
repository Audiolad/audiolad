"use client";

import { useMemo, useState } from "react";

import type { AdminMusicTrackRow } from "@/lib/admin/music-tracks-queries";

type SortMode = "track-code" | "title" | "artist" | "product";
type GroupMode = "none" | "artist" | "product";

const collator = new Intl.Collator("ru", {
  sensitivity: "base",
  numeric: true,
});

function compareRows(
  left: AdminMusicTrackRow,
  right: AdminMusicTrackRow,
  sort: SortMode,
): number {
  if (sort === "title") {
    return collator.compare(left.title, right.title);
  }

  if (sort === "artist") {
    return (
      collator.compare(left.artistName, right.artistName) ||
      collator.compare(left.productTitle, right.productTitle) ||
      left.position - right.position
    );
  }

  if (sort === "product") {
    return (
      collator.compare(left.productTitle, right.productTitle) ||
      left.position - right.position
    );
  }

  return collator.compare(left.trackCode, right.trackCode);
}

function groupLabel(row: AdminMusicTrackRow, group: GroupMode): string {
  if (group === "artist") {
    return row.artistName;
  }

  if (group === "product") {
    return row.productTitle;
  }

  return "";
}

export default function AdminMusicTracksTable({
  tracks,
}: {
  tracks: AdminMusicTrackRow[];
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("track-code");
  const [group, setGroup] = useState<GroupMode>("none");

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU");

    return tracks
      .filter((track) => {
        if (!needle) {
          return true;
        }

        return [
          track.trackCode,
          track.title,
          track.artistName,
          track.productTitle,
        ].some((value) => value.toLocaleLowerCase("ru-RU").includes(needle));
      })
      .sort((left, right) => compareRows(left, right, sort));
  }, [tracks, query, sort]);

  const grouped = useMemo(() => {
    if (group === "none") {
      return [{ label: "", rows: filtered }];
    }

    const map = new Map<string, AdminMusicTrackRow[]>();

    for (const row of filtered) {
      const label = groupLabel(row, group);
      const rows = map.get(label) ?? [];
      rows.push(row);
      map.set(label, rows);
    }

    return [...map.entries()]
      .sort(([left], [right]) => collator.compare(left, right))
      .map(([label, rows]) => ({ label, rows }));
  }, [filtered, group]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_220px_220px]">
        <label className="block">
          <span className="sr-only">Поиск по трекам</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Название, исполнитель, альбом или Track ID"
            className="w-full rounded-2xl border border-[#e4d7f4] bg-white px-4 py-3 text-sm text-[#25135c] outline-none placeholder:text-[#a79bbd] focus:border-[#7042c5]"
          />
        </label>

        <label className="block">
          <span className="sr-only">Сортировка</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortMode)}
            className="w-full rounded-2xl border border-[#e4d7f4] bg-white px-4 py-3 text-sm text-[#25135c] outline-none focus:border-[#7042c5]"
          >
            <option value="track-code">Сортировка: Track ID</option>
            <option value="title">Сортировка: название</option>
            <option value="artist">Сортировка: исполнитель</option>
            <option value="product">Сортировка: альбом</option>
          </select>
        </label>

        <label className="block">
          <span className="sr-only">Группировка</span>
          <select
            value={group}
            onChange={(event) => setGroup(event.target.value as GroupMode)}
            className="w-full rounded-2xl border border-[#e4d7f4] bg-white px-4 py-3 text-sm text-[#25135c] outline-none focus:border-[#7042c5]"
          >
            <option value="none">Без группировки</option>
            <option value="artist">Группировать по исполнителю</option>
            <option value="product">Группировать по альбому</option>
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-4 text-sm text-[#796ba0]">
        <span>
          Показано: <strong className="text-[#25135c]">{filtered.length}</strong>
          {filtered.length !== tracks.length ? " из " + tracks.length : ""}
        </span>
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="font-semibold text-[#7042c5] hover:underline"
          >
            Очистить поиск
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[22px] border border-[#eadff8] bg-white p-8 text-center">
          <p className="text-base font-medium text-[#25135c]">
            По этому запросу треки не найдены.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map((section) => (
            <section key={section.label || "all"}>
              {section.label ? (
                <div className="mb-2 flex items-center gap-2 px-1">
                  <h3 className="font-semibold text-[#25135c]">{section.label}</h3>
                  <span className="rounded-full bg-[#f3ecfb] px-2 py-0.5 text-xs font-semibold text-[#7042c5]">
                    {section.rows.length}
                  </span>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-[22px] border border-[#eadff8] bg-white">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-[#eee6f7] bg-[#faf6ff] text-[#796ba0]">
                      <tr>
                        <th className="px-4 py-3 font-medium">Track ID</th>
                        <th className="px-4 py-3 font-medium">Название трека</th>
                        <th className="px-4 py-3 font-medium">Исполнитель</th>
                        <th className="px-4 py-3 font-medium">Альбом / релиз</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((track) => (
                        <tr
                          key={track.id}
                          className="border-b border-[#f3edf9] last:border-b-0"
                        >
                          <td className="whitespace-nowrap px-4 py-4">
                            <code className="rounded-lg bg-[#f6f1fb] px-2 py-1 font-mono text-xs font-semibold text-[#5f36a7]">
                              {track.trackCode}
                            </code>
                          </td>
                          <td className="px-4 py-4 font-medium text-[#25135c]">
                            {track.title}
                          </td>
                          <td className="px-4 py-4 text-[#5f5574]">
                            <div>{track.artistName}</div>
                            {track.artistSlug ? (
                              <div className="mt-1 text-xs text-[#968aa9]">
                                /{track.artistSlug}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-4 text-[#5f5574]">
                            {track.productTitle}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
