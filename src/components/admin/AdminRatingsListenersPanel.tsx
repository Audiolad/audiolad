"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  ADMIN_RATINGS_LISTENER_NO_EMAIL,
  describeAdminRatingsListenerEventsTruncation,
  describeAdminRatingsListenerSignals,
  formatAdminRatingsListenedMs,
  formatAdminRatingsListenerName,
  formatAdminRatingsStars,
  type AdminRatingsListenerDetailBundle,
  type AdminRatingsListenerSort,
  type AdminRatingsListenerSortDir,
  type AdminRatingsListenersBundle,
} from "@/lib/admin/analytics-ratings-listeners";
import { formatAdminAverageStars } from "@/lib/admin/analytics-ratings";

const SORT_OPTIONS: ReadonlyArray<readonly [AdminRatingsListenerSort, string]> = [
  ["last_activity", "Последняя активность"],
  ["rating_count", "Число оценок"],
  ["registered_at", "Дата регистрации"],
  ["average", "Средняя оценка"],
];

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date);
}

function errorText(status: number): string {
  if (status === 401) return "Нужно войти в аккаунт администратора.";
  if (status === 403) {
    return "Недостаточно прав: для списка слушателей нужны analytics.view и users.view.";
  }
  if (status === 503) {
    return "Журнал доступа сейчас недоступен, поэтому данные слушателей не показаны.";
  }
  return "Не удалось загрузить данные. Попробуйте позже.";
}

export function AdminRatingsListenersPanel() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [sort, setSort] = useState<AdminRatingsListenerSort>("last_activity");
  const [sortDir, setSortDir] = useState<AdminRatingsListenerSortDir>("desc");
  const [offset, setOffset] = useState(0);
  const [list, setList] = useState<AdminRatingsListenersBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminRatingsListenerDetailBundle | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const listAbort = useRef<AbortController | null>(null);
  const detailAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    listAbort.current?.abort();
    const controller = new AbortController();
    listAbort.current = controller;
    const params = new URLSearchParams();
    if (submittedQuery) params.set("q", submittedQuery);
    params.set("sort", sort);
    params.set("dir", sortDir);
    if (offset > 0) params.set("offset", String(offset));

    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/analytics/ratings/listeners?${params}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          if (!controller.signal.aborted) {
            setError(errorText(res.status));
            setList(null);
            setLoading(false);
          }
          return;
        }
        const data = (await res.json()) as AdminRatingsListenersBundle;
        if (controller.signal.aborted) return;
        setList(data);
        setLoading(false);
      } catch {
        if (controller.signal.aborted) return;
        setError(errorText(500));
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [submittedQuery, sort, sortDir, offset]);

  useEffect(() => {
    detailAbort.current?.abort();
    if (!selectedUserId) return;
    const controller = new AbortController();
    detailAbort.current = controller;

    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setDetailLoading(true);
      setDetailError(null);
      setDetail(null);
      try {
        const res = await fetch(
          `/api/admin/analytics/ratings/listeners/${encodeURIComponent(selectedUserId)}`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        if (!res.ok) {
          if (!controller.signal.aborted) {
            setDetailError(res.status === 404 ? "Слушатель не найден." : errorText(res.status));
            setDetailLoading(false);
          }
          return;
        }
        const data = (await res.json()) as AdminRatingsListenerDetailBundle;
        if (controller.signal.aborted) return;
        setDetail(data);
        setDetailLoading(false);
      } catch {
        if (controller.signal.aborted) return;
        setDetailError(errorText(500));
        setDetailLoading(false);
      }
    })();

    return () => controller.abort();
  }, [selectedUserId]);

  const total = list?.total ?? 0;
  const pageSize = list?.limit ?? 50;
  const page = Math.floor(offset / pageSize) + 1;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mt-4" data-testid="admin-ratings-listeners">
      <p className="text-sm text-[#796ba0]">
        Слушатели, поставившие хотя бы одну оценку. «Оценок» — число оценённых продуктов
        (одна активная оценка на пару слушатель×продукт). Средняя — по неисключённым
        оценкам. Только просмотр: здесь нельзя исключать оценки или ограничивать аккаунты.
        Просмотр записывается в журнал доступа.
      </p>

      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setOffset(0);
          setSubmittedQuery(query.trim());
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={120}
          placeholder="Поиск: имя, фамилия или email"
          aria-label="Поиск слушателей по имени или email"
          className="min-w-[240px] flex-1 rounded-xl border border-[#eadff8] bg-[#fcfaff] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white"
        >
          Найти
        </button>
        <select
          value={sort}
          onChange={(event) => {
            setOffset(0);
            setSort(event.target.value as AdminRatingsListenerSort);
          }}
          aria-label="Сортировка"
          className="rounded-xl border border-[#eadff8] bg-white px-3 py-2 text-sm"
        >
          {SORT_OPTIONS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setOffset(0);
            setSortDir((dir) => (dir === "desc" ? "asc" : "desc"));
          }}
          className="rounded-full border border-[#eadff8] px-3 py-2 text-sm text-[#7042c5]"
          aria-label="Направление сортировки"
        >
          {sortDir === "desc" ? "↓ по убыванию" : "↑ по возрастанию"}
        </button>
      </form>

      {error ? <p className="mt-4 text-sm text-[#b42318]">{error}</p> : null}
      {loading && !error ? (
        <p className="mt-4 text-sm text-[#796ba0]">Загружаем слушателей…</p>
      ) : null}

      {!loading && !error && list ? (
        list.rows.length === 0 ? (
          <p className="mt-4 text-sm text-[#9485b4]">Слушателей с оценками не найдено.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="text-[#796ba0]">
                <tr className="border-b border-[#eadff8]">
                  <th className="py-2 pr-3">ФИО</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Регистрация</th>
                  <th className="py-2 pr-3">Оценок (продуктов)</th>
                  <th className="py-2 pr-3">Средняя</th>
                  <th className="py-2 pr-3">Первая оценка</th>
                  <th className="py-2 pr-3">Последняя активность</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => (
                  <tr
                    key={row.userId}
                    className={`border-b border-[#f3edf9] ${
                      selectedUserId === row.userId ? "bg-[#f7f2ff]" : ""
                    }`}
                  >
                    <td className="py-2 pr-3">
                      <span className={row.fullName ? "" : "text-[#9485b4]"}>
                        {formatAdminRatingsListenerName(row.fullName)}
                      </span>
                      {row.isTest ? (
                        <span className="ml-2 rounded-full bg-[#eef] px-2 py-0.5 text-xs text-[#555]">
                          тест
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{row.email ?? ADMIN_RATINGS_LISTENER_NO_EMAIL}</td>
                    <td className="py-2 pr-3">{formatDate(row.registeredAt)}</td>
                    <td className="py-2 pr-3">
                      {row.ratingCount}
                      {row.excludedCount > 0 ? (
                        <span className="text-[#9485b4]"> (искл. {row.excludedCount})</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{formatAdminAverageStars(row.average)}</td>
                    <td className="py-2 pr-3">{formatDate(row.firstRatedAt)}</td>
                    <td className="py-2 pr-3">{formatDate(row.lastActivityAt)}</td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(row.userId)}
                        className="text-[#7042c5] underline"
                      >
                        История
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex items-center gap-3 text-sm text-[#796ba0]">
              <button
                type="button"
                disabled={offset <= 0}
                onClick={() => setOffset(Math.max(0, offset - pageSize))}
                className="rounded-full border border-[#eadff8] px-3 py-1 disabled:opacity-40"
              >
                ← Назад
              </button>
              <span>
                Страница {page} / {pages} · всего {total}
              </span>
              <button
                type="button"
                disabled={offset + pageSize >= total}
                onClick={() => setOffset(offset + pageSize)}
                className="rounded-full border border-[#eadff8] px-3 py-1 disabled:opacity-40"
              >
                Вперёд →
              </button>
            </div>
          </div>
        )
      ) : null}

      {selectedUserId ? (
        <section
          className="mt-6 rounded-[20px] border border-[#eadff8] bg-[#fcfaff] p-4"
          aria-label="История оценок слушателя"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold text-[#2b1d4a]">История оценок</h3>
            <button
              type="button"
              onClick={() => {
                setSelectedUserId(null);
                setDetail(null);
              }}
              className="text-sm text-[#7042c5]"
            >
              Закрыть
            </button>
          </div>
          {detailLoading ? <p className="mt-2 text-sm text-[#796ba0]">Загружаем…</p> : null}
          {detailError ? <p className="mt-2 text-sm text-[#b42318]">{detailError}</p> : null}
          {detail && detail.found ? (
            <div className="mt-3 space-y-4 text-sm">
              <dl className="grid gap-1 sm:grid-cols-[180px_1fr]">
                <dt className="text-[#9485b4]">ФИО</dt>
                <dd>{formatAdminRatingsListenerName(detail.profile.fullName)}</dd>
                <dt className="text-[#9485b4]">Email</dt>
                <dd>{detail.profile.email ?? ADMIN_RATINGS_LISTENER_NO_EMAIL}</dd>
                <dt className="text-[#9485b4]">Регистрация</dt>
                <dd>{formatDate(detail.profile.registeredAt)}</dd>
                <dt className="text-[#9485b4]">Профиль</dt>
                <dd>
                  <Link
                    href={`/admin/users/${detail.profile.userId}`}
                    className="text-[#7042c5] underline"
                  >
                    Открыть в разделе «Пользователи»
                  </Link>
                </dd>
              </dl>

              {describeAdminRatingsListenerSignals(detail.signals).length > 0 ? (
                <div className="rounded-xl border border-[#eadff8] bg-white p-3">
                  <p className="font-medium text-[#2b1d4a]">Сигналы для ручного разбора</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-[#5b4d80]">
                    {describeAdminRatingsListenerSignals(detail.signals).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-[#9485b4]">
                    Это наблюдения, а не вывод о нарушении. Оценки не исключаются автоматически.
                  </p>
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left">
                  <thead className="text-[#796ba0]">
                    <tr className="border-b border-[#eadff8]">
                      <th className="py-2 pr-3">Продукт</th>
                      <th className="py-2 pr-3">Автор</th>
                      <th className="py-2 pr-3">Оценка</th>
                      <th className="py-2 pr-3">Первая оценка</th>
                      <th className="py-2 pr-3">Изменена</th>
                      <th className="py-2 pr-3">Прослушано</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.ratings.map((row) => (
                      <tr key={row.ratingId} className="border-b border-[#f3edf9]">
                        <td className="py-2 pr-3">
                          {row.href ? (
                            <a
                              href={row.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#7042c5] underline"
                            >
                              {row.title}
                            </a>
                          ) : (
                            row.title
                          )}
                          {row.excluded ? (
                            <span className="ml-2 text-xs text-[#9485b4]">исключена</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3">{row.authorName}</td>
                        <td className="py-2 pr-3" aria-label={`${row.stars} из 5`}>
                          <span className="text-[#f2a900]">{formatAdminRatingsStars(row.stars)}</span>
                        </td>
                        <td className="py-2 pr-3">{formatDate(row.createdAt)}</td>
                        <td className="py-2 pr-3">
                          {row.updatedAt && row.updatedAt !== row.createdAt
                            ? formatDate(row.updatedAt)
                            : "—"}
                        </td>
                        <td className="py-2 pr-3">{formatAdminRatingsListenedMs(row.realListenedMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {detail.ratingTotal > detail.ratings.length ? (
                  <p className="mt-2 text-xs text-[#9485b4]">
                    Показаны последние {detail.ratings.length} из {detail.ratingTotal}.
                  </p>
                ) : null}
              </div>

              {detail.events.some((event) => event.eventKind === "changed") ||
              describeAdminRatingsListenerEventsTruncation(detail) ? (
                <div>
                  <p className="font-medium text-[#2b1d4a]">Изменения оценок</p>
                  {describeAdminRatingsListenerEventsTruncation(detail) ? (
                    <p className="mt-1 text-xs text-[#9485b4]" role="note">
                      {describeAdminRatingsListenerEventsTruncation(detail)}
                    </p>
                  ) : null}
                  <ul className="mt-1 space-y-1 text-[#5b4d80]">
                    {detail.events
                      .filter((event) => event.eventKind === "changed")
                      .map((event) => (
                        <li key={event.id}>
                          {formatDate(event.occurredAt)} · {event.title}: {event.oldStars}★ →{" "}
                          {event.newStars}★
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
