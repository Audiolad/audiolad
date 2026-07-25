"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import type {
  AdminAnalyticsAcquisitionRow,
  AdminAnalyticsAuthorRow,
  AdminAnalyticsPracticeRow,
} from "@/lib/admin/analytics-queries";

type TabId = "practices" | "authors" | "utm";

function SortLink({
  label,
  sortKey,
  currentSort,
  currentDir,
  paramSort,
  paramDir,
}: {
  label: string;
  sortKey: string;
  currentSort: string;
  currentDir: "asc" | "desc";
  paramSort: string;
  paramDir: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = currentSort === sortKey;
  const nextDir = active && currentDir === "desc" ? "asc" : "desc";
  const params = new URLSearchParams(searchParams.toString());
  params.set(paramSort, sortKey);
  params.set(paramDir, nextDir);
  params.set("practicesPage", "1");
  params.set("authorsPage", "1");

  return (
    <Link
      href={`${pathname}?${params.toString()}`}
      className={active ? "font-semibold text-[#7042c5]" : "text-[#796ba0]"}
    >
      {label}
      {active ? (currentDir === "desc" ? " ↓" : " ↑") : ""}
    </Link>
  );
}

function PageLinks({
  page,
  pageSize,
  total,
  paramName,
}: {
  page: number;
  pageSize: number;
  total: number;
  paramName: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  if (pageCount <= 1) {
    return null;
  }

  function hrefFor(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, String(next));
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="mt-3 flex items-center justify-between text-sm text-[#796ba0]">
      <span>
        Стр. {page} из {pageCount} · всего {total.toLocaleString("ru-RU")}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="text-[#7042c5]">
            Назад
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} className="text-[#7042c5]">
            Дальше
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminAnalyticsBreakdownTabs({
  practices,
  authors,
  acquisition,
}: {
  practices: {
    total: number;
    rows: AdminAnalyticsPracticeRow[];
    sort: string;
    sortDir: "asc" | "desc";
    page: number;
    pageSize: number;
    error: string | null;
  };
  authors: {
    total: number;
    rows: AdminAnalyticsAuthorRow[];
    sort: string;
    sortDir: "asc" | "desc";
    page: number;
    pageSize: number;
    error: string | null;
  };
  acquisition: {
    attribution: "session_touch";
    total: number;
    rows: AdminAnalyticsAcquisitionRow[];
    page: number;
    pageSize: number;
    error: string | null;
  };
}) {
  const [tab, setTab] = useState<TabId>("practices");

  return (
    <section
      aria-labelledby="admin-breakdown-heading"
      className="rounded-[22px] border border-[#eadff8] bg-white p-5 shadow-sm"
    >
      <h2 id="admin-breakdown-heading" className="text-[19px] font-semibold">
        Разрезы
      </h2>
      <p className="mt-1 text-sm text-[#796ba0]">
        Агрегированные таблицы из PostgreSQL. UTM — session-touch.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["practices", "Практики"],
            ["authors", "Авторы"],
            ["utm", "Источники / UTM"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
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
        <div className="mt-4">
          {practices.error ? (
            <p className="text-sm text-[#b34f63]">
              Не удалось загрузить практики. Summary не затронут.
            </p>
          ) : practices.rows.length === 0 ? (
            <p className="text-sm text-[#9485b4]">Нет продуктовой активности.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[920px] w-full text-left text-sm">
                <thead className="sticky top-0 bg-white text-[#796ba0]">
                  <tr className="border-b border-[#eadff8]">
                    <th className="px-2 py-2 font-medium">Практика</th>
                    <th className="px-2 py-2 font-medium">Автор</th>
                    <th className="px-2 py-2 font-medium">
                      <SortLink
                        label="Просмотры"
                        sortKey="views"
                        currentSort={practices.sort}
                        currentDir={practices.sortDir}
                        paramSort="practicesSort"
                        paramDir="practicesSortDir"
                      />
                    </th>
                    <th className="px-2 py-2 font-medium">Люди</th>
                    <th className="px-2 py-2 font-medium">
                      <SortLink
                        label="Запуски"
                        sortKey="play_starts"
                        currentSort={practices.sort}
                        currentDir={practices.sortDir}
                        paramSort="practicesSort"
                        paramDir="practicesSortDir"
                      />
                    </th>
                    <th className="px-2 py-2 font-medium">
                      <SortLink
                        label="Слушатели"
                        sortKey="listeners"
                        currentSort={practices.sort}
                        currentDir={practices.sortDir}
                        paramSort="practicesSort"
                        paramDir="practicesSortDir"
                      />
                    </th>
                    <th className="px-2 py-2 font-medium">
                      <SortLink
                        label="Дослуш."
                        sortKey="completions"
                        currentSort={practices.sort}
                        currentDir={practices.sortDir}
                        paramSort="practicesSort"
                        paramDir="practicesSortDir"
                      />
                    </th>
                    <th className="px-2 py-2 font-medium">
                      <SortLink
                        label="Просм.→зап."
                        sortKey="view_to_play"
                        currentSort={practices.sort}
                        currentDir={practices.sortDir}
                        paramSort="practicesSort"
                        paramDir="practicesSortDir"
                      />
                    </th>
                    <th className="px-2 py-2 font-medium">
                      <SortLink
                        label="Зап.→дослуш."
                        sortKey="play_to_complete"
                        currentSort={practices.sort}
                        currentDir={practices.sortDir}
                        paramSort="practicesSort"
                        paramDir="practicesSortDir"
                      />
                    </th>
                    <th className="px-2 py-2 font-medium">Сохр.</th>
                  </tr>
                </thead>
                <tbody>
                  {practices.rows.map((row) => (
                    <tr key={row.practiceId} className="border-b border-[#f3ecfb]">
                      <td className="px-2 py-3 font-medium text-[#25135c]">
                        {row.href ? (
                          <Link href={row.href} className="text-[#7042c5] underline-offset-2 hover:underline">
                            {row.title}
                          </Link>
                        ) : (
                          row.title
                        )}
                      </td>
                      <td className="px-2 py-3">{row.authorName}</td>
                      <td className="px-2 py-3">
                        {row.views.toLocaleString("ru-RU")}
                        <span className="block text-[11px] text-[#9485b4]">события</span>
                      </td>
                      <td className="px-2 py-3">
                        {row.uniqueVisitors.toLocaleString("ru-RU")}
                        <span className="block text-[11px] text-[#9485b4]">люди</span>
                      </td>
                      <td className="px-2 py-3">
                        {row.playStarts.toLocaleString("ru-RU")}
                        <span className="block text-[11px] text-[#9485b4]">события</span>
                      </td>
                      <td className="px-2 py-3">
                        {row.uniqueListeners.toLocaleString("ru-RU")}
                        <span className="block text-[11px] text-[#9485b4]">люди</span>
                      </td>
                      <td className="px-2 py-3">
                        {row.completions.toLocaleString("ru-RU")}
                        <span className="ml-1 text-[11px] text-[#9485b4]">
                          / {row.uniqueCompleters.toLocaleString("ru-RU")} чел.
                        </span>
                      </td>
                      <td className="px-2 py-3" title="запуски / просмотры (события)">
                        {row.viewToPlayRate}
                      </td>
                      <td className="px-2 py-3" title="дослушивания / запуски (события)">
                        {row.playToCompleteRate}
                      </td>
                      <td className="px-2 py-3">
                        {row.saves.toLocaleString("ru-RU")}
                        <span className="block text-[11px] text-[#9485b4]">
                          {row.uniqueSavers.toLocaleString("ru-RU")} чел.
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PageLinks
            page={practices.page}
            pageSize={practices.pageSize}
            total={practices.total}
            paramName="practicesPage"
          />
        </div>
      ) : null}

      {tab === "authors" ? (
        <div className="mt-4">
          {authors.error ? (
            <p className="text-sm text-[#b34f63]">
              Не удалось загрузить авторов. Summary не затронут.
            </p>
          ) : authors.rows.length === 0 ? (
            <p className="text-sm text-[#9485b4]">Нет активности авторов.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead className="text-[#796ba0]">
                  <tr className="border-b border-[#eadff8]">
                    <th className="px-2 py-2 font-medium">Автор</th>
                    <th className="px-2 py-2 font-medium">Практики</th>
                    <th className="px-2 py-2 font-medium">
                      <SortLink
                        label="Просмотры"
                        sortKey="views"
                        currentSort={authors.sort}
                        currentDir={authors.sortDir}
                        paramSort="authorsSort"
                        paramDir="authorsSortDir"
                      />
                    </th>
                    <th className="px-2 py-2 font-medium">
                      <SortLink
                        label="Запуски"
                        sortKey="play_starts"
                        currentSort={authors.sort}
                        currentDir={authors.sortDir}
                        paramSort="authorsSort"
                        paramDir="authorsSortDir"
                      />
                    </th>
                    <th className="px-2 py-2 font-medium">
                      <SortLink
                        label="Слушатели"
                        sortKey="listeners"
                        currentSort={authors.sort}
                        currentDir={authors.sortDir}
                        paramSort="authorsSort"
                        paramDir="authorsSortDir"
                      />
                    </th>
                    <th className="px-2 py-2 font-medium">Дослуш.</th>
                    <th className="px-2 py-2 font-medium">Сохр.</th>
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
                      <td className="px-2 py-3">{row.publishedPractices}</td>
                      <td className="px-2 py-3">
                        {row.views.toLocaleString("ru-RU")}
                        <span className="block text-[11px] text-[#9485b4]">события</span>
                      </td>
                      <td className="px-2 py-3">
                        {row.playStarts.toLocaleString("ru-RU")}
                        <span className="block text-[11px] text-[#9485b4]">события</span>
                      </td>
                      <td className="px-2 py-3">
                        {row.uniqueListeners.toLocaleString("ru-RU")}
                        <span className="block text-[11px] text-[#9485b4]">люди</span>
                      </td>
                      <td className="px-2 py-3">{row.completions.toLocaleString("ru-RU")}</td>
                      <td className="px-2 py-3">{row.saves.toLocaleString("ru-RU")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-[#796ba0]">
            Регистрации авторам не приписываются: достоверной attribution-модели нет.
          </p>
          <PageLinks
            page={authors.page}
            pageSize={authors.pageSize}
            total={authors.total}
            paramName="authorsPage"
          />
        </div>
      ) : null}

      {tab === "utm" ? (
        <div className="mt-4">
          {acquisition.error ? (
            <p className="text-sm text-[#b34f63]">
              Не удалось загрузить UTM-разрез. Summary не затронут.
            </p>
          ) : acquisition.rows.length === 0 ? (
            <p className="text-sm text-[#9485b4]">Нет данных по источникам.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[820px] w-full text-left text-sm">
                <thead className="text-[#796ba0]">
                  <tr className="border-b border-[#eadff8]">
                    <th className="px-2 py-2 font-medium">Источник</th>
                    <th className="px-2 py-2 font-medium">Сессии</th>
                    <th className="px-2 py-2 font-medium">Посетители</th>
                    <th className="px-2 py-2 font-medium">Рег.</th>
                    <th className="px-2 py-2 font-medium">Запуски</th>
                    <th className="px-2 py-2 font-medium">Слушатели</th>
                    <th className="px-2 py-2 font-medium">Сохр.</th>
                  </tr>
                </thead>
                <tbody>
                  {acquisition.rows.map((row, index) => (
                    <tr
                      key={`${row.label}-${index}`}
                      className="border-b border-[#f3ecfb]"
                    >
                      <td className="px-2 py-3">
                        <p className="font-medium text-[#25135c]">{row.label}</p>
                        <p className="text-[11px] text-[#9485b4]">
                          {[row.utmSource, row.utmMedium, row.utmCampaign, row.utmContent]
                            .filter(Boolean)
                            .join(" · ") || "session-touch"}
                        </p>
                      </td>
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
          )}
          <p className="mt-2 text-xs text-[#796ba0]">
            Attribution: session-touch. Пустой UTM не называется «прямым», если это не
            доказано referrer/source.
          </p>
          <PageLinks
            page={acquisition.page}
            pageSize={acquisition.pageSize}
            total={acquisition.total}
            paramName="acquisitionPage"
          />
        </div>
      ) : null}
    </section>
  );
}
