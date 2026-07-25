"use client";

import Link from "next/link";
import { useMemo } from "react";

import { buildCsv, downloadCsv } from "@/lib/admin/analytics-csv";
import type {
  AdminAnalyticsAcquisitionRow,
  AdminAnalyticsAuthorRow,
  AdminAnalyticsPracticeRow,
} from "@/lib/admin/analytics-queries";
import type {
  AdminAnalyticsTab,
  AdminAnalyticsTopN,
  AdminAnalyticsUtmGroup,
} from "@/lib/admin/analytics-url-state";

type GroupedUtmRow = {
  key: string;
  label: string;
  sessions: number;
  visitors: number;
  registrations: number;
  playStarts: number;
  listeners: number;
  saves: number;
};

function filterPractices(
  rows: AdminAnalyticsPracticeRow[],
  query: string,
): AdminAnalyticsPracticeRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const haystack = [
      row.title,
      row.practiceSlug ?? "",
      row.authorName,
      row.authorSlug ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function groupUtm(
  rows: AdminAnalyticsAcquisitionRow[],
  group: AdminAnalyticsUtmGroup,
): GroupedUtmRow[] {
  const map = new Map<string, GroupedUtmRow>();

  for (const row of rows) {
    const raw =
      group === "campaign"
        ? row.utmCampaign
        : group === "medium"
          ? row.utmMedium
          : row.utmSource;
    const key = raw.trim() || "__none__";
    const label =
      key === "__none__"
        ? "Без UTM / прямые и неопределённые переходы"
        : raw.trim();
    const current = map.get(key) ?? {
      key,
      label,
      sessions: 0,
      visitors: 0,
      registrations: 0,
      playStarts: 0,
      listeners: 0,
      saves: 0,
    };
    current.sessions += row.sessions;
    current.visitors += row.visitors;
    current.registrations += row.registrations;
    current.playStarts += row.playStarts;
    current.listeners += row.listeners;
    current.saves += row.saves;
    map.set(key, current);
  }

  return [...map.values()].sort((a, b) => b.sessions - a.sessions);
}

export default function AdminAnalyticsBreakdownPanel({
  tab,
  top,
  query,
  utmGroup,
  practices,
  authors,
  acquisition,
  loading,
  error,
  onTabChange,
  onTopChange,
  onQueryChange,
  onUtmGroupChange,
  onPracticesSort,
  onAuthorsSort,
}: {
  tab: AdminAnalyticsTab;
  top: AdminAnalyticsTopN;
  query: string;
  utmGroup: AdminAnalyticsUtmGroup;
  practices: {
    total: number;
    rows: AdminAnalyticsPracticeRow[];
    sort: string;
    sortDir: "asc" | "desc";
    error: string | null;
  };
  authors: {
    total: number;
    rows: AdminAnalyticsAuthorRow[];
    sort: string;
    sortDir: "asc" | "desc";
    error: string | null;
  };
  acquisition: {
    total: number;
    rows: AdminAnalyticsAcquisitionRow[];
    error: string | null;
  };
  loading: boolean;
  error: string | null;
  onTabChange: (tab: AdminAnalyticsTab) => void;
  onTopChange: (top: AdminAnalyticsTopN) => void;
  onQueryChange: (query: string) => void;
  onUtmGroupChange: (group: AdminAnalyticsUtmGroup) => void;
  onPracticesSort: (sort: string) => void;
  onAuthorsSort: (sort: string) => void;
}) {
  const filteredPractices = useMemo(
    () => filterPractices(practices.rows, query),
    [practices.rows, query],
  );
  const groupedUtm = useMemo(
    () => groupUtm(acquisition.rows, utmGroup),
    [acquisition.rows, utmGroup],
  );

  function exportCurrent() {
    if (tab === "practices") {
      downloadCsv(
        "audiolad-practices.csv",
        buildCsv(
          [
            "title",
            "author",
            "views",
            "unique_visitors",
            "play_starts",
            "unique_listeners",
            "completions",
            "saves",
          ],
          filteredPractices.map((row) => [
            row.title,
            row.authorName,
            row.views,
            row.uniqueVisitors,
            row.playStarts,
            row.uniqueListeners,
            row.completions,
            row.saves,
          ]),
        ),
      );
      return;
    }

    if (tab === "authors") {
      downloadCsv(
        "audiolad-authors.csv",
        buildCsv(
          [
            "author",
            "published_practices",
            "views",
            "play_starts",
            "unique_listeners",
            "completions",
            "saves",
          ],
          authors.rows.map((row) => [
            row.name,
            row.publishedPractices,
            row.views,
            row.playStarts,
            row.uniqueListeners,
            row.completions,
            row.saves,
          ]),
        ),
      );
      return;
    }

    downloadCsv(
      "audiolad-utm.csv",
      buildCsv(
        ["group", "sessions", "visitors", "registrations", "play_starts", "listeners", "saves"],
        groupedUtm.map((row) => [
          row.label,
          row.sessions,
          row.visitors,
          row.registrations,
          row.playStarts,
          row.listeners,
          row.saves,
        ]),
      ),
    );
  }

  return (
    <section
      aria-labelledby="admin-breakdown-heading"
      className="rounded-[22px] border border-[#eadff8] bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="admin-breakdown-heading" className="text-[19px] font-semibold">
            Разрезы
          </h2>
          <p className="mt-1 text-sm text-[#796ba0]">
            Агрегаты из PostgreSQL. Загрузка после summary.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCurrent}
          className="rounded-full border border-[#eadff8] px-4 py-2 text-sm font-medium text-[#7042c5]"
        >
          Export CSV
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["practices", "Практики"],
            ["authors", "Авторы"],
            ["utm", "UTM"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              tab === id
                ? "bg-[#7042c5] text-white"
                : "border border-[#eadff8] text-[#7042c5]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "practices" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Поиск: название, slug, автор"
            className="min-w-[220px] flex-1 rounded-xl border border-[#eadff8] bg-[#fcfaff] px-3 py-2 text-sm"
            aria-label="Поиск практик"
          />
          {(["10", "25", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onTopChange(value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                top === value
                  ? "bg-[#7042c5] text-white"
                  : "border border-[#eadff8] text-[#7042c5]"
              }`}
            >
              {value === "all" ? "Все" : `Top ${value}`}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "utm" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["source", "Source"],
              ["campaign", "Campaign"],
              ["medium", "Medium"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onUtmGroupChange(id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                utmGroup === id
                  ? "bg-[#7042c5] text-white"
                  : "border border-[#eadff8] text-[#7042c5]"
              }`}
            >
              по {label}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-[#796ba0]">Загружаем таблицы…</p>
      ) : error ? (
        <p className="mt-6 text-sm text-[#b34f63]">
          Не удалось загрузить разрезы. Summary остаётся доступным.
        </p>
      ) : null}

      {!loading && !error && tab === "practices" ? (
        filteredPractices.length === 0 ? (
          <p className="mt-6 text-sm text-[#9485b4]">
            {query
              ? "По запросу ничего не найдено. Измените поиск или Top N."
              : "За выбранный период нет продуктовой активности."}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="text-[#796ba0]">
                <tr className="border-b border-[#eadff8]">
                  <th className="px-2 py-2">Практика</th>
                  <th className="px-2 py-2">Автор</th>
                  <th className="px-2 py-2">
                    <button type="button" onClick={() => onPracticesSort("views")}>
                      Просмотры{practices.sort === "views" ? (practices.sortDir === "desc" ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                  <th className="px-2 py-2">
                    <button type="button" onClick={() => onPracticesSort("play_starts")}>
                      Запуски{practices.sort === "play_starts" ? (practices.sortDir === "desc" ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                  <th className="px-2 py-2">
                    <button type="button" onClick={() => onPracticesSort("listeners")}>
                      Слушатели{practices.sort === "listeners" ? (practices.sortDir === "desc" ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                  <th className="px-2 py-2">
                    <button type="button" onClick={() => onPracticesSort("completions")}>
                      Дослуш.{practices.sort === "completions" ? (practices.sortDir === "desc" ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                  <th className="px-2 py-2">Сохр.</th>
                </tr>
              </thead>
              <tbody>
                {filteredPractices.map((row) => (
                  <tr key={row.practiceId} className="border-b border-[#f3ecfb]">
                    <td className="px-2 py-3 font-medium text-[#25135c]">
                      {row.href ? (
                        <Link href={row.href} className="text-[#7042c5] hover:underline">
                          {row.title}
                        </Link>
                      ) : (
                        row.title
                      )}
                    </td>
                    <td className="px-2 py-3">{row.authorName}</td>
                    <td className="px-2 py-3">
                      {row.views.toLocaleString("ru-RU")}
                      <span className="block text-[11px] text-[#9485b4]">
                        {row.uniqueVisitors.toLocaleString("ru-RU")} чел.
                      </span>
                    </td>
                    <td className="px-2 py-3">{row.playStarts.toLocaleString("ru-RU")}</td>
                    <td className="px-2 py-3">{row.uniqueListeners.toLocaleString("ru-RU")}</td>
                    <td className="px-2 py-3">{row.completions.toLocaleString("ru-RU")}</td>
                    <td className="px-2 py-3">{row.saves.toLocaleString("ru-RU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-[#9485b4]">
              Показано {filteredPractices.length} из {practices.total.toLocaleString("ru-RU")}
            </p>
          </div>
        )
      ) : null}

      {!loading && !error && tab === "authors" ? (
        authors.rows.length === 0 ? (
          <p className="mt-6 text-sm text-[#9485b4]">Нет активности авторов за период.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="text-[#796ba0]">
                <tr className="border-b border-[#eadff8]">
                  <th className="px-2 py-2">Автор</th>
                  <th className="px-2 py-2">
                    <button type="button" onClick={() => onAuthorsSort("play_starts")}>
                      Запуски{authors.sort === "play_starts" ? (authors.sortDir === "desc" ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                  <th className="px-2 py-2">Слушатели</th>
                  <th className="px-2 py-2">Дослуш.</th>
                  <th className="px-2 py-2">Сохр.</th>
                </tr>
              </thead>
              <tbody>
                {authors.rows.map((row) => (
                  <tr key={row.authorId} className="border-b border-[#f3ecfb]">
                    <td className="px-2 py-3 font-medium text-[#25135c]">
                      {row.href ? (
                        <Link href={row.href} className="text-[#7042c5] hover:underline">
                          {row.name}
                        </Link>
                      ) : (
                        row.name
                      )}
                      <span className="ml-2 text-xs text-[#9485b4]">
                        {row.publishedPractices} опубл. практ.
                      </span>
                    </td>
                    <td className="px-2 py-3">{row.playStarts.toLocaleString("ru-RU")}</td>
                    <td className="px-2 py-3">{row.uniqueListeners.toLocaleString("ru-RU")}</td>
                    <td className="px-2 py-3">{row.completions.toLocaleString("ru-RU")}</td>
                    <td className="px-2 py-3">{row.saves.toLocaleString("ru-RU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {!loading && !error && tab === "utm" ? (
        groupedUtm.length === 0 ? (
          <p className="mt-6 text-sm text-[#9485b4]">Нет данных по источникам.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead className="text-[#796ba0]">
                <tr className="border-b border-[#eadff8]">
                  <th className="px-2 py-2">Группа</th>
                  <th className="px-2 py-2">Сессии</th>
                  <th className="px-2 py-2">Посетители</th>
                  <th className="px-2 py-2">Рег.</th>
                  <th className="px-2 py-2">Запуски</th>
                  <th className="px-2 py-2">Слушатели</th>
                  <th className="px-2 py-2">Сохр.</th>
                </tr>
              </thead>
              <tbody>
                {groupedUtm.map((row) => (
                  <tr key={row.key} className="border-b border-[#f3ecfb]">
                    <td className="px-2 py-3 font-medium text-[#25135c]">{row.label}</td>
                    <td className="px-2 py-3">{row.sessions.toLocaleString("ru-RU")}</td>
                    <td className="px-2 py-3">{row.visitors.toLocaleString("ru-RU")}</td>
                    <td className="px-2 py-3">{row.registrations.toLocaleString("ru-RU")}</td>
                    <td className="px-2 py-3">{row.playStarts.toLocaleString("ru-RU")}</td>
                    <td className="px-2 py-3">{row.listeners.toLocaleString("ru-RU")}</td>
                    <td className="px-2 py-3">{row.saves.toLocaleString("ru-RU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </section>
  );
}
