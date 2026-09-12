"use client";

import { useMemo, useState } from "react";

type Row = {
  id: string; queryText: string; normalizedQuery: string; source: string;
  frequency: number | null; cluster: string | null; intent: string | null;
  recommendedFormat: string | null; audioFit: string | null; lifecycle: string;
  author: string | null; product: string | null; reservedAt: string | null; expiresAt: string | null; createdAt: string;
  reservationId: string | null; clusterId: string | null;
};
type Cluster = { id: string; name: string };

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

export default function AdminSeoQueriesClient({ initialRows, clusters: initialClusters }: { initialRows: Row[]; clusters: Cluster[] }) {
  const [rows, setRows] = useState(initialRows);
  const [clusterOptions, setClusterOptions] = useState(initialClusters);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [cluster, setCluster] = useState("");
  const [newQuery, setNewQuery] = useState("");
  const [newCluster, setNewCluster] = useState("");
  const [editingId, setEditingId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const clusters = useMemo(() => [...new Set(rows.map((row) => row.cluster).filter((value): value is string => Boolean(value)))], [rows]);
  const sources = useMemo(() => [...new Set(rows.map((row) => row.source))], [rows]);
  const filtered = useMemo(() => rows.filter((row) =>
    (row.queryText.toLowerCase().includes(search.toLowerCase()) || row.normalizedQuery.includes(search.toLowerCase()))
    && (!status || row.lifecycle === status)
    && (!source || row.source === source)
    && (!cluster || row.cluster === cluster),
  ), [rows, search, status, source, cluster]);

  async function addQuery(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/seo-queries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query_text: newQuery, source: "manual" }) });
    const payload = await response.json();
    if (!response.ok) return setNotice(payload.error === "normalized_query_duplicate" ? "Такой нормализованный запрос уже существует." : "Не удалось добавить запрос.");
    setRows((current) => [{ id: payload.query.id, queryText: payload.query.query_text, normalizedQuery: payload.query.normalized_query, source: payload.query.source, frequency: null, cluster: null, clusterId: null, intent: null, recommendedFormat: null, audioFit: null, lifecycle: "Свободен", author: null, product: null, reservedAt: null, expiresAt: null, createdAt: payload.query.created_at, reservationId: null }, ...current]);
    setNewQuery(""); setNotice("SEO-запрос добавлен.");
  }

  async function addCluster(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/seo-queries", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newCluster }) });
    const payload = await response.json();
    if (!response.ok) return setNotice("Не удалось создать кластер.");
    setClusterOptions((current) => [...current, payload.cluster].sort((a, b) => a.name.localeCompare(b.name, "ru")));
    setNewCluster(""); setNotice("Кластер создан.");
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get("id") ?? "");
    const response = await fetch("/api/admin/seo-queries", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({
      id, query_text: form.get("query_text"), frequency: form.get("frequency") === "" ? null : Number(form.get("frequency")),
      source: form.get("source"), cluster_id: form.get("cluster_id"), intent: form.get("intent"),
      recommended_format: form.get("recommended_format"), audio_fit: form.get("audio_fit"),
    }) });
    const payload = await response.json();
    if (!response.ok) return setNotice(payload.error === "normalized_query_duplicate" ? "Такой нормализованный запрос уже существует." : "Не удалось сохранить изменения.");
    const clusterItem = clusterOptions.find((item) => item.id === payload.query.cluster_id);
    setRows((current) => current.map((row) => row.id === id ? { ...row, queryText: payload.query.query_text, normalizedQuery: payload.query.normalized_query, frequency: payload.query.frequency, source: payload.query.source, clusterId: payload.query.cluster_id, cluster: clusterItem?.name ?? null, intent: payload.query.intent, recommendedFormat: payload.query.recommended_format, audioFit: payload.query.audio_fit } : row));
    setEditingId(""); setNotice("Изменения сохранены.");
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
    <form onSubmit={addCluster} className="flex flex-col gap-2 rounded-[22px] border border-[#eadff8] bg-white p-4 sm:flex-row">
      <input value={newCluster} onChange={(event) => setNewCluster(event.target.value)} required placeholder="Создать кластер" className="min-h-11 flex-1 rounded-xl border border-[#d7c4f5] px-3 text-sm" />
      <button className="min-h-11 rounded-full border border-[#bda6e1] px-5 text-sm font-semibold text-[#7042c5]">Создать кластер</button>
    </form>
    <div className="grid gap-2 sm:grid-cols-4">
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск" className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm" />
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm"><option value="">Все статусы</option>{["Свободен", "В работе", "На модерации", "Опубликован"].map((value) => <option key={value}>{value}</option>)}</select>
      <select value={source} onChange={(event) => setSource(event.target.value)} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm"><option value="">Все источники</option>{sources.map((value) => <option key={value}>{value}</option>)}</select>
      <select value={cluster} onChange={(event) => setCluster(event.target.value)} className="min-h-11 rounded-xl border border-[#d7c4f5] bg-white px-3 text-sm"><option value="">Все кластеры</option>{clusters.map((value) => <option key={value}>{value}</option>)}</select>
    </div>
    {notice ? <p role="status" className="text-sm text-[#4c3d78]">{notice}</p> : null}
    {editingId ? (() => {
      const row = rows.find((item) => item.id === editingId);
      return row ? <form onSubmit={saveEdit} className="grid gap-3 rounded-[22px] border border-[#d7c4f5] bg-[#faf6ff] p-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={row.id} />
        <input name="query_text" defaultValue={row.queryText} required className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm sm:col-span-2" />
        <input name="frequency" type="number" min="0" defaultValue={row.frequency ?? ""} placeholder="Частотность" className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm" />
        <select name="source" defaultValue={row.source} className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm">{["manual", "wordstat", "search_console", "yandex_webmaster", "other"].map((value) => <option key={value}>{value}</option>)}</select>
        <select name="cluster_id" defaultValue={row.clusterId ?? ""} className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm"><option value="">Без кластера</option>{clusterOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <input name="intent" defaultValue={row.intent ?? ""} placeholder="Intent" className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm" />
        <input name="recommended_format" defaultValue={row.recommendedFormat ?? ""} placeholder="Рекомендуемый формат" className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm" />
        <input name="audio_fit" defaultValue={row.audioFit ?? ""} placeholder="Audio Fit" className="min-h-11 rounded-xl border border-[#d7c4f5] px-3 text-sm" />
        <div className="flex gap-2"><button className="min-h-11 rounded-full bg-[#7042c5] px-5 text-sm font-semibold text-white">Сохранить</button><button type="button" onClick={() => setEditingId("")} className="min-h-11 px-4 text-sm text-[#7042c5]">Отмена</button></div>
      </form> : null;
    })() : null}
    <div className="hidden overflow-x-auto rounded-[22px] border border-[#eadff8] bg-white md:block"><table className="min-w-full text-left text-sm"><thead className="bg-[#faf6ff] text-[#796ba0]"><tr>{["Запрос", "Normalized", "Частотность", "Источник", "Кластер", "Intent", "Формат", "Audio Fit", "Статус", "Автор / продукт", "Бронь", "Создан", ""].map((title, index) => <th key={`${title}-${index}`} className="px-3 py-3 font-medium">{title}</th>)}</tr></thead><tbody>{filtered.map((row) => <tr key={row.id} className="border-t border-[#f3edf9]"><td className="px-3 py-3 font-medium">{row.queryText}</td><td className="px-3 py-3 text-[#796ba0]">{row.normalizedQuery}</td><td className="px-3 py-3">{row.frequency ?? "—"}</td><td className="px-3 py-3">{row.source}</td><td className="px-3 py-3">{row.cluster ?? "—"}</td><td className="px-3 py-3">{row.intent ?? "—"}</td><td className="px-3 py-3">{row.recommendedFormat ?? "—"}</td><td className="px-3 py-3">{row.audioFit ?? "—"}</td><td className="px-3 py-3">{row.lifecycle}</td><td className="px-3 py-3">{row.author ?? "—"}{row.product ? ` / ${row.product}` : ""}</td><td className="px-3 py-3">{date(row.reservedAt)} / {date(row.expiresAt)}</td><td className="px-3 py-3">{date(row.createdAt)}</td><td className="px-3 py-3"><button onClick={() => setEditingId(row.id)} className="mr-2 text-xs font-semibold text-[#7042c5]">Изменить</button>{row.reservationId && row.lifecycle !== "Опубликован" ? <button onClick={() => release(row.reservationId!)} className="text-xs font-semibold text-[#7042c5]">Снять бронь</button> : null}</td></tr>)}</tbody></table></div>
    <div className="space-y-3 md:hidden">{filtered.map((row) => <article key={row.id} className="rounded-[22px] border border-[#eadff8] bg-white p-4"><h2 className="font-semibold text-[#25135c]">{row.queryText}</h2><p className="mt-1 text-xs text-[#796ba0]">{row.normalizedQuery}</p><div className="mt-3 grid grid-cols-2 gap-2 text-sm text-[#5f5484]"><span>{row.lifecycle}</span><span>{row.frequency ?? "—"} частотность</span><span>{row.cluster ?? "Без кластера"}</span><span>{row.author ?? "Свободен"}</span></div></article>)}</div>
  </div>;
}
