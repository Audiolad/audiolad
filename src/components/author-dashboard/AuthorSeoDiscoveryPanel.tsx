"use client";

import { useState, type FormEvent } from "react";

import {
  isSeoActiveReservationLimitReached,
  nextActiveReservationCountAfterReserve,
} from "@/lib/seo-queries/types";

export type AuthorSeoDiscoveryResult = {
  phrase: string;
  frequency: number;
  status: string;
  statusLabel: string;
  queryId: string | null;
  reservationId: string | null;
  productTitle: string | null;
  canReserve: boolean;
  canPropose: boolean;
};

export type AuthorSeoDiscoveryReservedEvent = {
  queryId: string;
  phrase: string;
  frequency: number;
  reservationId: string;
  expiresAt: string | null;
};

type Props = {
  authorId: string;
  /** dashboard = search-first Aurafon home copy; opportunities = existing SEO page heading */
  variant: "dashboard" | "opportunities";
  activeReservationCount: number;
  onReserved?: (event: AuthorSeoDiscoveryReservedEvent) => void;
};

function formatMonthlyFrequency(value: number) {
  return `Запросов в месяц: ${value.toLocaleString("ru-RU")}`;
}

/**
 * Single closed-beta SEO discovery implementation for Aurafon:
 * database matches + Wordstat additions. Used by main dashboard and /seo-opportunities.
 */
export default function AuthorSeoDiscoveryPanel({
  authorId,
  variant,
  activeReservationCount,
  onReserved,
}: Props) {
  const [discoverPhrase, setDiscoverPhrase] = useState("");
  const [discoverySeedPhrase, setDiscoverySeedPhrase] = useState<string | null>(null);
  const [databaseMatches, setDatabaseMatches] = useState<AuthorSeoDiscoveryResult[]>([]);
  const [discoverResults, setDiscoverResults] = useState<AuthorSeoDiscoveryResult[]>([]);
  const [discoverMessage, setDiscoverMessage] = useState<string | null>(null);
  const [discoverPending, setDiscoverPending] = useState(false);
  const [proposePendingKey, setProposePendingKey] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [activeCountSync, setActiveCountSync] = useState({
    authorId,
    baseline: activeReservationCount,
    local: activeReservationCount,
  });
  if (
    activeCountSync.authorId !== authorId
    || activeCountSync.baseline !== activeReservationCount
  ) {
    setActiveCountSync({
      authorId,
      baseline: activeReservationCount,
      local: activeReservationCount,
    });
  }
  const effectiveActiveCount = activeCountSync.local;

  async function reserve(queryId: string) {
    setPendingId(queryId);
    setDiscoverMessage(null);
    const response = await fetch("/api/author/seo-reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ author_id: authorId, query_id: queryId }),
    });
    const payload = await response.json();
    setPendingId(null);
    if (!response.ok) {
      setDiscoverMessage(payload.message ?? "Не удалось закрепить запрос.");
      return;
    }
    const reservationId = payload.reservation?.id as string;
    const expiresAt =
      typeof payload.reservation?.expires_at === "string"
        ? payload.reservation.expires_at
        : null;
    const match =
      databaseMatches.find((item) => item.queryId === queryId) ??
      discoverResults.find((item) => item.queryId === queryId);
    setDatabaseMatches((current) =>
      current.map((item) =>
        item.queryId === queryId
          ? {
              ...item,
              status: "own",
              statusLabel: "У вас в работе",
              canReserve: false,
              canPropose: false,
              reservationId,
            }
          : item,
      ),
    );
    setDiscoverResults((current) =>
      current.map((item) =>
        item.queryId === queryId
          ? {
              ...item,
              status: "own",
              statusLabel: "У вас в работе",
              canReserve: false,
              canPropose: false,
              reservationId,
            }
          : item,
      ),
    );
    setActiveCountSync((current) => ({
      ...current,
      local: nextActiveReservationCountAfterReserve(current.local, true),
    }));
    if (match) {
      onReserved?.({
        queryId,
        phrase: match.phrase,
        frequency: match.frequency,
        reservationId,
        expiresAt,
      });
    }
    setDiscoverMessage(payload.message ?? "Запрос закреплен за вами");
  }

  async function runDiscovery(event: FormEvent) {
    event.preventDefault();
    const phrase = discoverPhrase.trim();
    if (!phrase) return;
    setDiscoverPending(true);
    setDiscoverMessage(null);
    setDiscoverResults([]);
    setDatabaseMatches([]);
    setDiscoverySeedPhrase(null);
    const response = await fetch("/api/author/seo/discovery", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ author_id: authorId, phrase }),
    });
    const payload = await response.json();
    setDiscoverPending(false);
    if (!response.ok) {
      const code = typeof payload.code === "string" ? payload.code : "";
      if (code === "seo_discovery_beta_disabled") {
        setDiscoverMessage("Эта функция пока доступна только в закрытой бете.");
      } else if (typeof payload.error === "string" && payload.error.trim()) {
        setDiscoverMessage(payload.error);
      } else {
        setDiscoverMessage("Не удалось найти запросы.");
      }
      return;
    }
    const seed =
      typeof payload.phrase === "string" && payload.phrase.trim()
        ? payload.phrase.trim()
        : phrase;
    setDiscoverySeedPhrase(seed);
    setDatabaseMatches(Array.isArray(payload.databaseMatches) ? payload.databaseMatches : []);
    setDiscoverResults(Array.isArray(payload.results) ? payload.results : []);
    const dbCount = Array.isArray(payload.databaseMatches) ? payload.databaseMatches.length : 0;
    const wsCount = Array.isArray(payload.results) ? payload.results.length : 0;
    if (!dbCount && !wsCount) {
      setDiscoverMessage("Подходящих запросов не найдено.");
    }
  }

  async function propose(item: AuthorSeoDiscoveryResult) {
    const key = item.phrase;
    if (!discoverySeedPhrase) {
      setDiscoverMessage("Данные изменились. Выполните поиск ещё раз.");
      return;
    }
    setProposePendingKey(key);
    setDiscoverMessage(null);
    const response = await fetch("/api/author/seo/proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        author_id: authorId,
        seed_phrase: discoverySeedPhrase,
        phrase: item.phrase,
      }),
    });
    const payload = await response.json();
    setProposePendingKey(null);
    if (!response.ok) {
      setDiscoverMessage(
        payload.error === "wordstat_selection_stale"
          ? (payload.message ?? "Данные изменились. Выполните поиск ещё раз.")
          : payload.error === "already_analyzed"
            ? "Этот запрос уже есть в базе возможностей."
            : payload.error === "not_applicable"
              ? "Этот запрос не подходит для SEO-возможностей."
              : "Не удалось отправить запрос на проверку.",
      );
      if (payload.discovery) {
        setDiscoverResults((current) =>
          current.map((row) => (row.phrase === item.phrase ? payload.discovery : row)),
        );
      }
      return;
    }
    setDiscoverResults((current) =>
      current.map((row) =>
        row.phrase === item.phrase
          ? {
              ...row,
              status: "proposed",
              statusLabel: "На проверке",
              canPropose: false,
              canReserve: false,
              queryId: payload.queryId ?? row.queryId,
            }
          : row,
      ),
    );
    setDiscoverMessage(payload.message ?? "Запрос отправлен на проверку.");
  }

  const heading =
    variant === "dashboard" ? "Найдите тему для нового аудиопродукта" : "Что ищут слушатели";
  const subtitle =
    variant === "dashboard"
      ? "Введите тему — сначала покажем проверенные запросы из базы АудиоЛада, затем дополнительные варианты из Яндекса."
      : "Введите одну тему — сначала покажем проверенные запросы из базы АудиоЛада, затем дополнительные варианты из Яндекса.";

  return (
    <section className="rounded-[24px] border border-[#d7c4f5] bg-white p-5 shadow-[0_8px_22px_rgba(91,62,145,0.05)]">
      {variant === "dashboard" ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-[#7042c5]">Бета</p>
      ) : null}
      <h2 className={`text-lg font-semibold text-[#25135c] ${variant === "dashboard" ? "mt-1" : ""}`}>
        {heading}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#4c3d78]">{subtitle}</p>
      <form onSubmit={runDiscovery} className="mt-4 space-y-3">
        <label className="block text-sm font-medium text-[#25135c]">
          Введите тему или поисковый запрос
          <input
            value={discoverPhrase}
            onChange={(event) => setDiscoverPhrase(event.target.value)}
            placeholder="Например: музыка для сна"
            className="mt-2 min-h-11 w-full rounded-xl border border-[#d7c4f5] bg-[#faf6ff] px-3 text-sm outline-none focus:border-[#7042c5]"
          />
        </label>
        <button
          type="submit"
          disabled={discoverPending || !discoverPhrase.trim()}
          className="inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {discoverPending ? "Ищем…" : "Найти запросы"}
        </button>
      </form>
      {discoverMessage ? (
        <p role="status" className="mt-3 text-sm font-medium text-[#4c3d78]">
          {discoverMessage}
        </p>
      ) : null}

      {databaseMatches.length > 0 || discoverResults.length > 0 || discoverySeedPhrase ? (
        <div className="mt-5 space-y-6">
          <div>
            <h3 className="text-base font-semibold text-[#25135c]">
              Подходящие запросы из базы АудиоЛада
            </h3>
            <p className="mt-1 text-sm leading-6 text-[#4c3d78]">
              Эти запросы уже проверены АудиоЛадом. Свободный запрос можно сразу взять в работу.
            </p>
            {databaseMatches.length === 0 ? (
              <p className="mt-3 text-sm text-[#796ba0]">
                В базе АудиоЛада пока нет подходящих проверенных запросов.
              </p>
            ) : (
              <div className="mt-3 grid gap-3">
                {databaseMatches.map((item) => (
                  <article
                    key={`db-${item.queryId ?? item.phrase}`}
                    className="rounded-[18px] border border-[#eadff8] bg-[#faf6ff] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="text-base font-semibold text-[#25135c]">{item.phrase}</h4>
                        <p className="mt-1 text-sm text-[#5f5484]">
                          {formatMonthlyFrequency(item.frequency)}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#7042c5]">
                        {item.statusLabel}
                      </span>
                    </div>
                    {item.status === "own" && item.productTitle ? (
                      <p className="mt-2 text-sm text-[#5f5484]">Продукт: {item.productTitle}</p>
                    ) : null}
                    {item.canReserve && item.queryId ? (
                      <button
                        type="button"
                        disabled={pendingId === item.queryId || isSeoActiveReservationLimitReached(effectiveActiveCount)}
                        onClick={() => reserve(item.queryId!)}
                        className="mt-3 inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Взять в работу
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-base font-semibold text-[#25135c]">
              Дополнительные варианты из Яндекса
            </h3>
            <p className="mt-1 text-sm leading-6 text-[#4c3d78]">
              Эти запросы найдены в Wordstat. Запросы, которых ещё нет в проверенной базе АудиоЛада, можно
              отправить на проверку.
            </p>
            {discoverResults.length === 0 ? (
              <p className="mt-3 text-sm text-[#796ba0]">Дополнительных вариантов из Яндекса сейчас нет.</p>
            ) : (
              <div className="mt-3 grid gap-3">
                {discoverResults.map((item) => {
                  const proposeKey = item.phrase;
                  const proposing = proposePendingKey === proposeKey;
                  return (
                    <article
                      key={`ws-${item.phrase}`}
                      className="rounded-[18px] border border-[#eadff8] bg-[#faf6ff] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="text-base font-semibold text-[#25135c]">{item.phrase}</h4>
                          <p className="mt-1 text-sm text-[#5f5484]">
                            {formatMonthlyFrequency(item.frequency)}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#7042c5]">
                          {item.statusLabel}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.canPropose ? (
                          <div className="space-y-1">
                            <button
                              type="button"
                              disabled={proposing}
                              onClick={() => propose(item)}
                              className="inline-flex min-h-10 items-center rounded-full border border-[#bda6e1] bg-white px-4 text-sm font-semibold text-[#7042c5] disabled:opacity-50"
                            >
                              {proposing ? "Отправляем…" : "Отправить на проверку"}
                            </button>
                            <p className="text-xs leading-5 text-[#796ba0]">
                              После проверки запрос можно будет взять в работу, если он свободен.
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
