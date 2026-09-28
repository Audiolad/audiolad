"use client";

import Link from "next/link";

import { buildCsv, downloadCsv } from "@/lib/admin/analytics-csv";
import { formatListeningTimeNotice } from "@/lib/admin/format-listening-time";
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
import SortableColumnHeader from "@/components/stats/SortableColumnHeader";
import type { SortOrder } from "@/lib/stats/table-sort";

function SortableHead({
  label,
  sortKey,
  sort,
  direction,
  onSort,
}: {
  label: string;
  sortKey: string;
  sort: string;
  direction: SortOrder;
  onSort: (sort: string) => void;
}) {
  const active = sort === sortKey;
  return (
    <th
      className="px-2 py-2 font-medium whitespace-nowrap"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <SortableColumnHeader
        label={label}
        active={active}
        direction={direction}
        onSort={() => onSort(sortKey)}
      />
    </th>
  );
}

function PracticeHeader(props: {
  label: string;
  sortKey: string;
  sort: string;
  direction: SortOrder;
  onSort: (sort: string) => void;
}) {
  return <SortableHead {...props} />;
}

function AuthorHeader(props: {
  label: string;
  sortKey: string;
  sort: string;
  direction: SortOrder;
  onSort: (sort: string) => void;
}) {
  return <SortableHead {...props} />;
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
  onUtmSort,
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
    listeningTimeValidFrom: string | null;
    listeningTimePartial: boolean;
    listeningTimeUnmeasured: boolean;
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
    sort: string;
    sortDir: SortOrder;
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
  onUtmSort: (sort: string) => void;
}) {
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
            "listened_ms",
          ],
          practices.rows.map((row) => [
            row.title,
            row.authorName,
            row.views,
            row.uniqueVisitors,
            row.playStarts,
            row.uniqueListeners,
            row.completions,
            row.saves,
            row.listenedMs ?? "",
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
        acquisition.rows.map((row) => [
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
        practices.rows.length === 0 ? (
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
                  <PracticeHeader label="Практика" sortKey="title" sort={practices.sort} direction={practices.sortDir} onSort={onPracticesSort} />
                  <PracticeHeader label="Автор" sortKey="author" sort={practices.sort} direction={practices.sortDir} onSort={onPracticesSort} />
                  <PracticeHeader label="Просмотры" sortKey="views" sort={practices.sort} direction={practices.sortDir} onSort={onPracticesSort} />
                  <PracticeHeader label="Запуски" sortKey="play_starts" sort={practices.sort} direction={practices.sortDir} onSort={onPracticesSort} />
                  <PracticeHeader label="Слушатели" sortKey="listeners" sort={practices.sort} direction={practices.sortDir} onSort={onPracticesSort} />
                  <PracticeHeader label="Дослуш." sortKey="completions" sort={practices.sort} direction={practices.sortDir} onSort={onPracticesSort} />
                  <PracticeHeader label="Время прослушивания" sortKey="listened_ms" sort={practices.sort} direction={practices.sortDir} onSort={onPracticesSort} />
                  <PracticeHeader label="Сохр." sortKey="saves" sort={practices.sort} direction={practices.sortDir} onSort={onPracticesSort} />
                </tr>
              </thead>
              <tbody>
                {practices.rows.map((row) => (
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
                    <td className="px-2 py-3">{row.listeningTimeLabel}</td>
                    <td className="px-2 py-3">{row.saves.toLocaleString("ru-RU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-[#9485b4]">
              Показано {practices.rows.length} из {practices.total.toLocaleString("ru-RU")}
              {practices.sort === "listened_ms"
                ? " · Топ практик по времени прослушивания"
                : ""}
            </p>
            {practices.listeningTimePartial || practices.listeningTimeUnmeasured ? (
              <p className="mt-1 text-xs text-[#7042c5]">
                {practices.listeningTimeValidFrom
                  ? formatListeningTimeNotice(practices.listeningTimeValidFrom)
                  : "Время прослушивания собирается с момента включения учёта"}
              </p>
            ) : null}
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
                  <AuthorHeader label="Автор" sortKey="name" sort={authors.sort} direction={authors.sortDir} onSort={onAuthorsSort} />
                  <AuthorHeader label="Практики" sortKey="published_practices" sort={authors.sort} direction={authors.sortDir} onSort={onAuthorsSort} />
                  <AuthorHeader label="Просмотры" sortKey="views" sort={authors.sort} direction={authors.sortDir} onSort={onAuthorsSort} />
                  <AuthorHeader label="Запуски" sortKey="play_starts" sort={authors.sort} direction={authors.sortDir} onSort={onAuthorsSort} />
                  <AuthorHeader label="Слушатели" sortKey="listeners" sort={authors.sort} direction={authors.sortDir} onSort={onAuthorsSort} />
                  <AuthorHeader label="Дослуш." sortKey="completions" sort={authors.sort} direction={authors.sortDir} onSort={onAuthorsSort} />
                  <AuthorHeader label="Сохр." sortKey="saves" sort={authors.sort} direction={authors.sortDir} onSort={onAuthorsSort} />
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
                    </td>
                    <td className="px-2 py-3">{row.publishedPractices.toLocaleString("ru-RU")}</td>
                    <td className="px-2 py-3">{row.views.toLocaleString("ru-RU")}</td>
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
        acquisition.rows.length === 0 ? (
          <p className="mt-6 text-sm text-[#9485b4]">Нет данных по источникам.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead className="text-[#796ba0]">
                <tr className="border-b border-[#eadff8]">
                  <SortableHead label="Группа" sortKey="group" sort={acquisition.sort} direction={acquisition.sortDir} onSort={onUtmSort} />
                  <SortableHead label="Сессии" sortKey="sessions" sort={acquisition.sort} direction={acquisition.sortDir} onSort={onUtmSort} />
                  <SortableHead label="Посетители" sortKey="visitors" sort={acquisition.sort} direction={acquisition.sortDir} onSort={onUtmSort} />
                  <SortableHead label="Рег." sortKey="registrations" sort={acquisition.sort} direction={acquisition.sortDir} onSort={onUtmSort} />
                  <SortableHead label="Запуски" sortKey="play_starts" sort={acquisition.sort} direction={acquisition.sortDir} onSort={onUtmSort} />
                  <SortableHead label="Слушатели" sortKey="listeners" sort={acquisition.sort} direction={acquisition.sortDir} onSort={onUtmSort} />
                  <SortableHead label="Сохр." sortKey="saves" sort={acquisition.sort} direction={acquisition.sortDir} onSort={onUtmSort} />
                </tr>
              </thead>
              <tbody>
                {acquisition.rows.map((row, index) => (
                  <tr key={`${row.label}-${index}`} className="border-b border-[#f3ecfb]">
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
