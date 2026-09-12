"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { SeoQueryOpportunity } from "@/lib/seo-queries/types";
import { lifecycleLabel } from "@/lib/seo-queries/types";

type ProductOption = { id: string; title: string };
type Props = {
  authorId: string;
  authorSlug: string;
  opportunities: SeoQueryOpportunity[];
  products: ProductOption[];
};

function formatUntil(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value))
    : null;
}

export default function AuthorSeoOpportunitiesClient({
  authorId, authorSlug, opportunities, products,
}: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(opportunities);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, string>>({});
  const activeCount = items.filter((item) => item.reservationId && item.lifecycle !== "published").length;
  const visible = useMemo(
    () => items.filter((item) => item.queryText.toLowerCase().includes(query.trim().toLowerCase())),
    [items, query],
  );

  async function reserve(queryId: string) {
    setPendingId(queryId);
    setMessage(null);
    const response = await fetch("/api/author/seo-reservations", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ author_id: authorId, query_id: queryId }),
    });
    const payload = await response.json();
    setPendingId(null);
    if (!response.ok) return setMessage(payload.message ?? "Не удалось закрепить запрос.");
    setItems((current) => current.map((item) => item.id === queryId
      ? { ...item, reservationId: payload.reservation.id, expiresAt: payload.reservation.expires_at, lifecycle: "in_progress" }
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
      <section className="rounded-[24px] border border-[#d7c4f5] bg-[#faf6ff] p-5">
        <p className="text-sm leading-6 text-[#4c3d78]">Выберите поисковый запрос, под который хотите создать аудиопродукт. Одновременно можно взять в работу до 5 запросов.</p>
        <p className="mt-3 text-sm font-semibold text-[#25135c]">Мои SEO-запросы: {activeCount} из 5</p>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по запросам" className="mt-4 min-h-11 w-full rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm outline-none focus:border-[#7042c5]" />
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
                  <p className="mt-1 text-xs text-[#796ba0]">normalized: {item.normalizedQuery}</p>
                </div>
                <span className="rounded-full bg-[#f7f2ff] px-3 py-1 text-xs font-semibold text-[#7042c5]">{lifecycleLabel(item.lifecycle)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#5f5484]">
                {item.frequency !== null ? <span>Частотность: {item.frequency}</span> : null}
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
