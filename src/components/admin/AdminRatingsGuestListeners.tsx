"use client";

import { useEffect, useState } from "react";

import {
  describeAdminRatingsGuestSignals,
  formatAdminRatingsListenedMs,
  formatAdminRatingsStars,
  type AdminRatingsGuestListenerDetail,
  type AdminRatingsGuestListenersBundle,
} from "@/lib/admin/analytics-ratings-listeners";
import { formatAdminAverageStars } from "@/lib/admin/analytics-ratings";
import {
  GUEST_RATING_ADMIN_NO_IP_SANCTION,
  GUEST_RATING_ADMIN_NO_PII,
  formatGuestSessionAdminLabel,
} from "@/lib/ratings/guest/copy";

function formatDate(value: string | null): string {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date);
}

export function AdminRatingsGuestListeners() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [list, setList] = useState<AdminRatingsGuestListenersBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminRatingsGuestListenerDetail | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (submittedQuery) params.set("q", submittedQuery);
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/analytics/ratings/listeners/guests?${params}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          setError("Не удалось загрузить гостевые оценки.");
          setList(null);
          setLoading(false);
          return;
        }
        setList((await response.json()) as AdminRatingsGuestListenersBundle);
        setLoading(false);
      } catch {
        if (!controller.signal.aborted) {
          setError("Не удалось загрузить гостевые оценки.");
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, [submittedQuery]);

  useEffect(() => {
    if (!guestId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/admin/analytics/ratings/listeners/guests/${guestId}`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        if (!response.ok) {
          setDetail({ found: false });
          return;
        }
        setDetail((await response.json()) as AdminRatingsGuestListenerDetail);
      } catch {
        if (!controller.signal.aborted) setDetail({ found: false });
      }
    })();
    return () => controller.abort();
  }, [guestId]);

  return (
    <div>
      <p className="text-sm text-[#65577f]">{GUEST_RATING_ADMIN_NO_PII}</p>
      {list ? (
        <p className="mt-2 text-sm text-[#65577f]">
          Музыка и звуки: {list.segments.music.ratingCount} · средняя{" "}
          {formatAdminAverageStars(list.segments.music.average)}. Аудиопрактики:{" "}
          {list.segments.practice.ratingCount} · средняя{" "}
          {formatAdminAverageStars(list.segments.practice.average)}.
        </p>
      ) : null}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmittedQuery(query.trim());
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ID сессии"
          aria-label="Поиск по анонимному ID"
          className="w-full max-w-md rounded-xl border border-[#eadff8] px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-full bg-[#7042c5] px-4 py-2 text-sm text-white">
          Найти
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-[#b42318]">{error}</p> : null}
      {loading ? <p className="mt-3 text-sm text-[#796ba0]">Загружаем гостей…</p> : null}
      {list && list.rows.length === 0 && !loading ? (
        <p className="mt-3 text-sm text-[#9485b4]">Гостевых оценок пока нет.</p>
      ) : null}
      {list && list.rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-[#796ba0]">
              <tr className="border-b border-[#eadff8]">
                <th className="py-2 pr-3">Сессия</th>
                <th className="py-2 pr-3">Оценок</th>
                <th className="py-2 pr-3">Средняя</th>
                <th className="py-2 pr-3">Последняя активность</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {list.rows.map((row) => (
                <tr key={row.guestId} className="border-b border-[#f3edf9]">
                  <td className="py-2 pr-3">{formatGuestSessionAdminLabel(row.guestId)}</td>
                  <td className="py-2 pr-3">
                    {row.ratingCount}
                    {row.supersededCount > 0 ? (
                      <span className="text-[#9485b4]"> (привязано {row.supersededCount})</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{formatAdminAverageStars(row.average)}</td>
                  <td className="py-2 pr-3">{formatDate(row.lastActivityAt)}</td>
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      className="text-[#7042c5] underline"
                      onClick={() => setGuestId(row.guestId)}
                    >
                      Журнал
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {detail && detail.found ? (
        <section className="mt-6 rounded-[20px] border border-[#eadff8] bg-[#fcfaff] p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold text-[#2b1d4a]">
              {formatGuestSessionAdminLabel(detail.guestId)}
            </h3>
            <button type="button" className="text-sm text-[#7042c5]" onClick={() => setDetail(null)}>
              Закрыть
            </button>
          </div>
          <p className="mt-2 text-sm text-[#65577f]">{GUEST_RATING_ADMIN_NO_PII}</p>
          {describeAdminRatingsGuestSignals(detail.signals).length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[#5b4d80]">
              {describeAdminRatingsGuestSignals(detail.signals).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 text-xs text-[#9485b4]">{GUEST_RATING_ADMIN_NO_IP_SANCTION}</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-[#796ba0]">
                <tr className="border-b border-[#eadff8]">
                  <th className="py-2 pr-3">Продукт</th>
                  <th className="py-2 pr-3">Оценка</th>
                  <th className="py-2 pr-3">Прослушано</th>
                  <th className="py-2 pr-3">Статус</th>
                </tr>
              </thead>
              <tbody>
                {detail.ratings.map((row) => (
                  <tr key={row.ratingId} className="border-b border-[#f3edf9]">
                    <td className="py-2 pr-3">{row.title}</td>
                    <td className="py-2 pr-3">{formatAdminRatingsStars(row.stars)}</td>
                    <td className="py-2 pr-3">{formatAdminRatingsListenedMs(row.realListenedMs)}</td>
                    <td className="py-2 pr-3">
                      {row.superseded ? "привязана к аккаунту" : row.excluded ? "исключена" : "активна"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <p className="font-medium text-[#2b1d4a]">Журнал действий</p>
            <ul className="mt-1 space-y-1 text-sm text-[#5b4d80]">
              {detail.events.map((event) => (
                <li key={event.id}>
                  {formatDate(event.occurredAt)} · {event.title}: {event.action}
                  {event.oldStars != null ? ` ${event.oldStars}★ → ${event.newStars}★` : ` ${event.newStars}★`}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
