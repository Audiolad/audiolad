"use client";

import { useMemo, useState } from "react";

type Row = {
  id: string; queryText: string; normalizedQuery: string; source: string;
  frequency: number | null; cluster: string | null; intent: string | null;
  recommendedFormat: string | null; audioFit: string | null; lifecycle: string;
  author: string | null; product: string | null; reservedAt: string | null; expiresAt: string | null; createdAt: string;
  reservationId: string | null;
};

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

export default function AdminSeoQueriesClient({ initialRows }: { initialRows: Row[] }) {
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [newQuery, setNewQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const filtered = useMemo(() => rows.filter((row) => row.queryText.toLowerCase().includes(search.toLowerCase()) || row.normalizedQuery.includes(search.toLowerCase())), [rows, search]);

  async function addQuery(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/seo-queries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query_text: newQuery, source: "manual" }) });
    const payload = await response.json();
    if (!response.ok) return setNotice(payload.error === "normalized_query_duplicate" ? "Такой нормализованный запрос уже существует." : "Не удалось добавить запрос.");
    setRows((current) => [{ id: payload.query.id, queryText: payload.query.query_text, normalizedQuery: payload.query.normalized_query, source: payload.query.source, frequency: null, cluster: null, intent: null, recommendedFormat: null, audioFit: null, lifecycle: "Свободен", author: null, product: null, reservedAt: null, expiresAt: null, createdAt: payload.query.created_at, reservationId: null }, ...current]);
    setNewQuery(""); setNotice("SEO-запрос добавлен.");
  }

  async function release(reservationId: string) {
    const response = await fetch("/api/admin/seo-queries", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ reservation_id: reservationId }) });
    if (!response.ok) return setNotice("Не удалось снять бронь.");
    setRows((current) => current.map((row) => row.reservationId === reservationId ? { ...row, reservationId: null, lifecycle: "Свободен", author: null, product: null, reservedAt: null, expiresAt: null } : row));
    setNotice("Бронь снята.");
  }

  return <div className="space-y-5">
    <form onSubmit={addQuery} className="flex flex-col gap-2 rounded-[22px] border border-[#eadff8] bg-white p-4 sm:flex-row">
      <input value={newQuery} onChange={(event) => setNewQuery(event.target.value)} required placeholder="Добавить SEO-запрос вручную" className="min-h-11 flex-1 rounded-xl border border-[#d7c4f5] px-3 text-sm" />
      <button className="min-h-11 rounded-full bg-[#7042c5] px-5 text-sm font-semibold text-white">Добавить</button>
    </form>
    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск" className="min-h-11 w-full rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm" />
    {notice ? <p role="status" className="text-sm text-[#4c3d78]">{notice}</p> : null}
    <div className="hidden overflow-x-auto rounded-[22px] border border-[#eadff8] bg-white md:block"><table className="min-w-full text-left text-sm"><thead className="bg-[#faf6ff] text-[#796ba0]"><tr>{["Запрос", "Normalized", "Частотность", "Источник", "Кластер", "Intent", "Формат", "Audio Fit", "Статус", "Автор / продукт", "Бронь", "Создан", ""].map((title) => <th key={title} className="px-3 py-3 font-medium">{title}</th>)}</tr></thead><tbody>{filtered.map((row) => <tr key={row.id} className="border-t border-[#f3edf9]"><td className="px-3 py-3 font-medium">{row.queryText}</td><td className="px-3 py-3 text-[#796ba0]">{row.normalizedQuery}</td><td className="px-3 py-3">{row.frequency ?? "—"}</td><td className="px-3 py-3">{row.source}</td><td className="px-3 py-3">{row.cluster ?? "—"}</td><td className="px-3 py-3">{row.intent ?? "—"}</td><td className="px-3 py-3">{row.recommendedFormat ?? "—"}</td><td className="px-3 py-3">{row.audioFit ?? "—"}</td><td className="px-3 py-3">{row.lifecycle}</td><td className="px-3 py-3">{row.author ?? "—"}{row.product ? ` / ${row.product}` : ""}</td><td className="px-3 py-3">{date(row.reservedAt)} / {date(row.expiresAt)}</td><td className="px-3 py-3">{date(row.createdAt)}</td><td className="px-3 py-3">{row.reservationId && row.lifecycle !== "Опубликован" ? <button onClick={() => release(row.reservationId!)} className="text-xs font-semibold text-[#7042c5]">Снять бронь</button> : null}</td></tr>)}</tbody></table></div>
    <div className="space-y-3 md:hidden">{filtered.map((row) => <article key={row.id} className="rounded-[22px] border border-[#eadff8] bg-white p-4"><h2 className="font-semibold text-[#25135c]">{row.queryText}</h2><p className="mt-1 text-xs text-[#796ba0]">{row.normalizedQuery}</p><div className="mt-3 grid grid-cols-2 gap-2 text-sm text-[#5f5484]"><span>{row.lifecycle}</span><span>{row.frequency ?? "—"} частотность</span><span>{row.cluster ?? "Без кластера"}</span><span>{row.author ?? "Свободен"}</span></div></article>)}</div>
  </div>;
}
