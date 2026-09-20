"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { buildSeoReservationProductCreateHref } from "@/lib/seo-queries/reservation-product-create-href";
import AuthorSeoDiscoveryPanel from "@/components/author-dashboard/AuthorSeoDiscoveryPanel";
import AuthorSeoPromptBuilder from "@/components/author-dashboard/AuthorSeoPromptBuilder";
import type { SeoQueryOpportunity } from "@/lib/seo-queries/types";
import {
  countActiveAuthorSeoReservations,
  lifecycleLabel,
  SEO_ACTIVE_RESERVATION_LIMIT,
} from "@/lib/seo-queries/types";

type ProductOption = { id: string; title: string };
type Props = {
  authorId: string;
  authorSlug: string;
  discoveryEnabled?: boolean;
  opportunities: SeoQueryOpportunity[];
  products: ProductOption[];
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

  const activeCount = countActiveAuthorSeoReservations(items);
  const clusters = useMemo(() => [...new Set(items.map((item) => item.clusterName).filter((value): value is string => Boolean(value)))], [items]);
  const formats = useMemo(() => [...new Set(items.map((item) => item.recommendedFormat).filter((value): value is string => Boolean(value)))], [items]);
  const visible = useMemo(() => items.filter((item) =>
    item.queryText.toLowerCase().includes(query.trim().toLowerCase())
    && (!cluster || item.clusterName === cluster)
    && (!format || item.recommendedFormat === format),
  ), [items, query, cluster, format]);

  async function reserve(queryId: string) {
    setPendingId(queryId);
    setMessage(null);
    const response = await fetch("/api/author/seo-reservations", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ author_id: authorId, query_id: queryId }),
    });
    const payload = await response.json();
    setPendingId(null);
    if (!response.ok) {
      setMessage(payload.message ?? "Не удалось закрепить запрос.");
      return;
    }
    setItems((current) => current.map((item) => item.id === queryId
      ? { ...item, reservationId: payload.reservation.id, expiresAt: payload.reservation.expires_at, lifecycle: "in_progress" as const }
      : item));
    setMessage("Запрос закреплен за вами");
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

  return (
    <div className="space-y-5">
      {discoveryEnabled ? (
        <AuthorSeoDiscoveryPanel
          authorId={authorId}
          authorSlug={authorSlug}
          variant="opportunities"
          activeReservationCount={activeCount}
          analyzedOpportunities={items}
          onReserved={(event) => {
            setItems((current) => {
              const exists = current.some((item) => item.id === event.queryId);
              if (exists) {
                return current.map((item) => item.id === event.queryId
                  ? {
                      ...item,
                      reservationId: event.reservationId,
                      expiresAt: event.expiresAt,
                      lifecycle: "in_progress" as const,
                    }
                  : item);
              }
              return [
                {
                  id: event.queryId,
                  queryText: event.phrase,
                  source: "wordstat",
                  frequency: event.frequency,
                  clusterName: null,
                  intent: null,
                  recommendedFormat: null,
                  audioFit: null,
                  lifecycle: "in_progress" as const,
                  reservationId: event.reservationId,
                  expiresAt: event.expiresAt,
                  productId: null,
                  productTitle: null,
                },
                ...current,
              ];
            });
          }}
        />
      ) : null}

      <section className="rounded-[24px] border border-[#d7c4f5] bg-[#faf6ff] p-5">
        <p className="text-sm leading-6 text-[#4c3d78]">Выберите поисковый запрос, под который хотите создать аудиопродукт. Одновременно можно взять в работу до 5 запросов.</p>
        <p className="mt-3 text-sm font-semibold text-[#25135c]">Мои SEO-запросы: {activeCount} из {SEO_ACTIVE_RESERVATION_LIMIT}</p>
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
                  item.reservationId ? (
                    <Link href={buildSeoReservationProductCreateHref({ authorSlug, reservationId: item.reservationId })} className="inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white">Создать продукт по этому запросу</Link>
                  ) : null
                )}
                {!item.productId && products.length > 0 && item.reservationId ? <>
                  <select aria-label="Связать с черновиком" value={selectedProducts[item.reservationId] ?? ""} onChange={(event) => setSelectedProducts((current) => ({ ...current, [item.reservationId!]: event.target.value }))} className="min-h-10 rounded-xl border border-[#d7c4f5] px-2 text-sm">
                    <option value="">Выбрать черновик</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
                  </select>
                  <button type="button" disabled={!selectedProducts[item.reservationId] || pendingId === item.reservationId} onClick={() => link(item.reservationId!, selectedProducts[item.reservationId!]!)} className="min-h-10 rounded-full border border-[#bda6e1] px-4 text-sm font-semibold text-[#7042c5] disabled:opacity-50">Связать</button>
                </> : null}
                {item.lifecycle === "in_progress" && item.reservationId ? <button type="button" disabled={pendingId === item.reservationId} onClick={() => release(item.reservationId!)} className="min-h-10 rounded-full border border-[#bda6e1] px-4 text-sm font-semibold text-[#7042c5] disabled:opacity-50">Освободить</button> : null}
              </div> : isAvailable ? <button type="button" disabled={pendingId === item.id || activeCount >= SEO_ACTIVE_RESERVATION_LIMIT} onClick={() => reserve(item.id)} className="mt-4 inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-50">Взять в работу</button> : null}
              {discoveryEnabled && own && item.lifecycle === "in_progress" && item.reservationId ? (
                <AuthorSeoPromptBuilder
                  primaryQueryText={item.queryText}
                  primaryQueryId={item.id}
                  analyzedOpportunities={items}
                />
              ) : null}
            </article>;
          })}
        </div>
      )}
    </div>
  );
}
