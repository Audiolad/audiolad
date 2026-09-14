"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

import type { SeoQueryOpportunity } from "@/lib/seo-queries/types";
import { lifecycleLabel } from "@/lib/seo-queries/types";

type ProductOption = { id: string; title: string };
type Props = {
  authorId: string;
  authorSlug: string;
  discoveryEnabled?: boolean;
  opportunities: SeoQueryOpportunity[];
  products: ProductOption[];
};

type DiscoveryResult = {
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

function formatUntil(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value))
    : null;
}

function formatMonthlyFrequency(value: number) {
  return `Запросов в месяц: ${value.toLocaleString("ru-RU")}`;
}

export default function AuthorSeoOpportunitiesClient({
  authorId, authorSlug, discoveryEnabled = false, opportunities, products,
}: Props) {
  const [query, setQuery] = useState("");
  const [cluster, setCluster] = useState("");
  const [format, setFormat] = useState("");
  const [items, setItems] = useState(opportunities);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, string>>({});

  const [discoverPhrase, setDiscoverPhrase] = useState("");
  const [discoverySeedPhrase, setDiscoverySeedPhrase] = useState<string | null>(null);
  const [databaseMatches, setDatabaseMatches] = useState<DiscoveryResult[]>([]);
  const [discoverResults, setDiscoverResults] = useState<DiscoveryResult[]>([]);
  const [discoverMessage, setDiscoverMessage] = useState<string | null>(null);
  const [discoverPending, setDiscoverPending] = useState(false);
  const [proposePendingKey, setProposePendingKey] = useState<string | null>(null);

  const activeCount = items.filter((item) => item.reservationId && item.lifecycle !== "published").length;
  const clusters = useMemo(() => [...new Set(items.map((item) => item.clusterName).filter((value): value is string => Boolean(value)))], [items]);
  const formats = useMemo(() => [...new Set(items.map((item) => item.recommendedFormat).filter((value): value is string => Boolean(value)))], [items]);
  const visible = useMemo(() => items.filter((item) =>
    item.queryText.toLowerCase().includes(query.trim().toLowerCase())
    && (!cluster || item.clusterName === cluster)
    && (!format || item.recommendedFormat === format),
  ), [items, query, cluster, format]);

  async function reserve(queryId: string, fromDiscovery = false) {
    setPendingId(queryId);
    setMessage(null);
    setDiscoverMessage(null);
    const response = await fetch("/api/author/seo-reservations", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ author_id: authorId, query_id: queryId }),
    });
    const payload = await response.json();
    setPendingId(null);
    if (!response.ok) {
      const text = payload.message ?? "Не удалось закрепить запрос.";
      if (fromDiscovery) setDiscoverMessage(text);
      else setMessage(text);
      return;
    }
    setItems((current) => {
      const exists = current.some((item) => item.id === queryId);
      if (exists) {
        return current.map((item) => item.id === queryId
          ? { ...item, reservationId: payload.reservation.id, expiresAt: payload.reservation.expires_at, lifecycle: "in_progress" as const }
          : item);
      }
      const discovery = databaseMatches.find((item) => item.queryId === queryId)
        ?? discoverResults.find((item) => item.queryId === queryId);
      if (!discovery) return current;
      return [
        {
          id: queryId,
          queryText: discovery.phrase,
          source: "wordstat",
          frequency: discovery.frequency,
          clusterName: null,
          intent: null,
          recommendedFormat: null,
          audioFit: null,
          lifecycle: "in_progress" as const,
          reservationId: payload.reservation.id,
          expiresAt: payload.reservation.expires_at,
          productId: null,
          productTitle: null,
        },
        ...current,
      ];
    });
    setDatabaseMatches((current) => current.map((item) => item.queryId === queryId
      ? {
          ...item,
          status: "own",
          statusLabel: "У вас в работе",
          canReserve: false,
          canPropose: false,
          reservationId: payload.reservation.id,
        }
      : item));
    setDiscoverResults((current) => current.map((item) => item.queryId === queryId
      ? {
          ...item,
          status: "own",
          statusLabel: "У вас в работе",
          canReserve: false,
          canPropose: false,
          reservationId: payload.reservation.id,
        }
      : item));
    const ok = "Запрос закреплен за вами";
    if (fromDiscovery) setDiscoverMessage(ok);
    else setMessage(ok);
  }

  async function release(reservationId: string) {
    setPendingId(reservationId);
    setMessage(null);
    const response = await fetch("/api/author/seo-reservations", {
      method: "DELETE", headers: { "content-type": "application/json" },
      body: JSON.stringify({ author_id: authorId, reservation_id: reservationId }),
    });
    const payload = await response.json();
    setPendingId(null);
    if (!response.ok) return setMessage(payload.message ?? "Не удалось освободить запрос.");
    setItems((current) => current.map((item) => item.reservationId === reservationId
      ? { ...item, reservationId: null, expiresAt: null, productId: null, productTitle: null, lifecycle: "available" }
      : item));
  }

  async function link(reservationId: string, productId: string) {
    if (!productId) return;
    setPendingId(reservationId);
    const response = await fetch("/api/author/seo-reservations", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ author_id: authorId, reservation_id: reservationId, product_id: productId }),
    });
    await response.json();
    setPendingId(null);
    if (!response.ok) return setMessage("Не удалось связать запрос с продуктом.");
    const product = products.find((item) => item.id === productId);
    setItems((current) => current.map((item) => item.reservationId === reservationId
      ? { ...item, productId, productTitle: product?.title ?? null, expiresAt: null }
      : item));
    setMessage("Запрос связан с продуктом.");
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

  async function propose(item: DiscoveryResult) {
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
      setDiscoverMessage(payload.error === "wordstat_selection_stale"
        ? (payload.message ?? "Данные изменились. Выполните поиск ещё раз.")
        : payload.error === "already_analyzed"
        ? "Этот запрос уже есть в базе возможностей."
        : payload.error === "not_applicable"
          ? "Этот запрос не подходит для SEO-возможностей."
          : "Не удалось отправить запрос на проверку.");
      if (payload.discovery) {
        setDiscoverResults((current) => current.map((row) => row.phrase === item.phrase ? payload.discovery : row));
      }
      return;
    }
    setDiscoverResults((current) => current.map((row) => row.phrase === item.phrase
      ? {
          ...row,
          status: "proposed",
          statusLabel: "На проверке",
          canPropose: false,
          canReserve: false,
          queryId: payload.queryId ?? row.queryId,
        }
      : row));
    setDiscoverMessage(payload.message ?? "Запрос отправлен на проверку.");
  }

  return (
    <div className="space-y-5">
      {discoveryEnabled ? (
      <section className="rounded-[24px] border border-[#d7c4f5] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">Что ищут слушатели</h2>
        <p className="mt-2 text-sm leading-6 text-[#4c3d78]">
          Введите одну тему — сначала покажем проверенные запросы из базы АудиоЛада, затем дополнительные варианты из Яндекса.
        </p>
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
        {discoverMessage ? <p role="status" className="mt-3 text-sm font-medium text-[#4c3d78]">{discoverMessage}</p> : null}

        {(databaseMatches.length > 0 || discoverResults.length > 0 || discoverySeedPhrase) ? (
          <div className="mt-5 space-y-6">
            <div>
              <h3 className="text-base font-semibold text-[#25135c]">Подходящие запросы из базы АудиоЛада</h3>
              <p className="mt-1 text-sm leading-6 text-[#4c3d78]">
                Эти запросы уже проверены АудиоЛадом. Свободный запрос можно сразу взять в работу.
              </p>
              {databaseMatches.length === 0 ? (
                <p className="mt-3 text-sm text-[#796ba0]">В базе АудиоЛада пока нет подходящих проверенных запросов.</p>
              ) : (
                <div className="mt-3 grid gap-3">
                  {databaseMatches.map((item) => (
                    <article key={`db-${item.queryId ?? item.phrase}`} className="rounded-[18px] border border-[#eadff8] bg-[#faf6ff] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="text-base font-semibold text-[#25135c]">{item.phrase}</h4>
                          <p className="mt-1 text-sm text-[#5f5484]">{formatMonthlyFrequency(item.frequency)}</p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#7042c5]">{item.statusLabel}</span>
                      </div>
                      {item.status === "own" && item.productTitle ? (
                        <p className="mt-2 text-sm text-[#5f5484]">Продукт: {item.productTitle}</p>
                      ) : null}
                      {item.canReserve && item.queryId ? (
                        <button
                          type="button"
                          disabled={pendingId === item.queryId || activeCount >= 5}
                          onClick={() => reserve(item.queryId!, true)}
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
              <h3 className="text-base font-semibold text-[#25135c]">Дополнительные варианты из Яндекса</h3>
              <p className="mt-1 text-sm leading-6 text-[#4c3d78]">
                Эти запросы найдены в Wordstat. Запросы, которых ещё нет в проверенной базе АудиоЛада, можно отправить на проверку.
              </p>
              {discoverResults.length === 0 ? (
                <p className="mt-3 text-sm text-[#796ba0]">Дополнительных вариантов из Яндекса сейчас нет.</p>
              ) : (
                <div className="mt-3 grid gap-3">
                  {discoverResults.map((item) => {
                    const proposeKey = item.phrase;
                    const proposing = proposePendingKey === proposeKey;
                    return (
                      <article key={`ws-${item.phrase}`} className="rounded-[18px] border border-[#eadff8] bg-[#faf6ff] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="text-base font-semibold text-[#25135c]">{item.phrase}</h4>
                            <p className="mt-1 text-sm text-[#5f5484]">{formatMonthlyFrequency(item.frequency)}</p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#7042c5]">{item.statusLabel}</span>
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
      ) : null}

      <section className="rounded-[24px] border border-[#d7c4f5] bg-[#faf6ff] p-5">
        <p className="text-sm leading-6 text-[#4c3d78]">Выберите поисковый запрос, под который хотите создать аудиопродукт. Одновременно можно взять в работу до 5 запросов.</p>
        <p className="mt-3 text-sm font-semibold text-[#25135c]">Мои SEO-запросы: {activeCount} из 5</p>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по запросам" className="mt-4 min-h-11 w-full rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm outline-none focus:border-[#7042c5]" />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <select value={cluster} onChange={(event) => setCluster(event.target.value)} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm"><option value="">Все темы</option>{clusters.map((value) => <option key={value}>{value}</option>)}</select>
          <select value={format} onChange={(event) => setFormat(event.target.value)} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm"><option value="">Все форматы</option>{formats.map((value) => <option key={value}>{value}</option>)}</select>
        </div>
        {message ? <p role="status" className="mt-3 text-sm font-medium text-[#4c3d78]">{message}</p> : null}
      </section>

      {visible.length === 0 ? <div className="rounded-[22px] border border-[#eadff8] bg-white p-8 text-center text-sm text-[#796ba0]">Подходящих SEO-запросов пока нет.</div> : (
        <div className="grid gap-4">
          {visible.map((item) => {
            const own = Boolean(item.reservationId);
            const isAvailable = item.lifecycle === "available";
            const until = formatUntil(item.expiresAt);
            return <article key={item.id} className="rounded-[22px] border border-[#eadff8] bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#25135c]">{item.queryText}</h2>
                </div>
                <span className="rounded-full bg-[#f7f2ff] px-3 py-1 text-xs font-semibold text-[#7042c5]">{lifecycleLabel(item.lifecycle)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#5f5484]">
                {item.frequency !== null ? <span>{formatMonthlyFrequency(item.frequency)}</span> : null}
                {item.clusterName ? <span>Тема: {item.clusterName}</span> : null}
                {item.recommendedFormat ? <span>Формат: {item.recommendedFormat}</span> : null}
              </div>
              {own ? <div className="mt-4 flex flex-wrap items-center gap-3">
                {until ? <span className="text-sm text-[#5f5484]">До {until}</span> : null}
                {item.productId ? <Link href={`/author-dashboard/products/${item.productId}`} className="text-sm font-semibold text-[#7042c5]">Открыть продукт</Link> : (
                  <Link href={`/author-dashboard/products/new?author=${encodeURIComponent(authorSlug)}`} className="inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white">Создать продукт по этому запросу</Link>
                )}
                {!item.productId && products.length > 0 && item.reservationId ? <>
                  <select aria-label="Связать с черновиком" value={selectedProducts[item.reservationId] ?? ""} onChange={(event) => setSelectedProducts((current) => ({ ...current, [item.reservationId!]: event.target.value }))} className="min-h-10 rounded-xl border border-[#d7c4f5] px-2 text-sm">
                    <option value="">Выбрать черновик</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
                  </select>
                  <button type="button" disabled={!selectedProducts[item.reservationId] || pendingId === item.reservationId} onClick={() => link(item.reservationId!, selectedProducts[item.reservationId!]!)} className="min-h-10 rounded-full border border-[#bda6e1] px-4 text-sm font-semibold text-[#7042c5] disabled:opacity-50">Связать</button>
                </> : null}
                {item.lifecycle === "in_progress" && item.reservationId ? <button type="button" disabled={pendingId === item.reservationId} onClick={() => release(item.reservationId!)} className="min-h-10 rounded-full border border-[#bda6e1] px-4 text-sm font-semibold text-[#7042c5] disabled:opacity-50">Освободить</button> : null}
              </div> : isAvailable ? <button type="button" disabled={pendingId === item.id || activeCount >= 5} onClick={() => reserve(item.id)} className="mt-4 inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-50">Взять в работу</button> : null}
            </article>;
          })}
        </div>
      )}
    </div>
  );
}
