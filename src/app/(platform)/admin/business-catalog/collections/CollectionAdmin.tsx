"use client";

import { useState } from "react";
import type { CollectionTrack } from "@/lib/business-collections/model";
import { createCollection, revokeCollection, regenerateCollection } from "./actions";

type Entry = { id: string; title: string; revoked_at: string | null };
export default function CollectionAdmin({ tracks, collections }: { tracks: CollectionTrack[]; collections: Entry[] }) {
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [regenerated, setRegenerated] = useState<string[]>([]);
  const [revoked, setRevoked] = useState<string[]>([]);
  const albums = [...new Map(tracks.map((track) => [track.albumId, track.albumTitle])).entries()];
  const toggle = (ids: string[], checked: boolean) => setSelected((old) => checked ? [...new Set([...old, ...ids])] : old.filter((id) => !ids.includes(id)));
  async function create() {
    setBusy(true); setMessage(null); setLink(null);
    try {
      const result = await createCollection({ title, tracks: tracks.filter((track) => selected.includes(track.audioItemId)).map((track) => track.audioItemId) });
      if (result.ok) { setLink(result.link); setSelected([]); setTitle(""); }
      else setMessage(result.error);
    } catch { setMessage("Не удалось создать подборку. Повторите попытку."); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setMessage(null); setLink(null);
    try {
      if ((await revokeCollection(id)).ok) setRevoked((old) => [...old, id]);
      else setMessage("Не удалось отозвать ссылку. Обновите страницу и повторите попытку.");
    } catch { setMessage("Не удалось отозвать ссылку."); }
    finally { setBusy(false); }
  }
  async function regenerate(id: string) {
    setBusy(true); setMessage(null); setLink(null);
    try {
      const result = await regenerateCollection(id);
      if (result.ok) {
        setLink(result.link);
        setRegenerated((old) => [...old, id]);
        setRevoked((old) => old.filter((value) => value !== id));
      } else setMessage(result.error);
    } catch { setMessage("Не удалось перевыпустить ссылку."); }
    finally { setBusy(false); }
  }
  async function copyLink() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setMessage("Ссылка скопирована."); }
    catch { setMessage("Выделите и скопируйте ссылку из поля."); }
  }
  return <div className="space-y-6">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void create(); }}>
      <label className="block">Название подборки
        <input className="ml-3 rounded border p-2" value={title} maxLength={120} required disabled={busy} onChange={(event) => setTitle(event.target.value)} placeholder="Подборка для заведения" />
      </label>
      <p>Выбрано: {selected.length} треков. Альбом можно выбрать целиком или раскрыть и выбрать отдельные записи.</p>
      {albums.map(([id, name]) => {
        const rows = tracks.filter((track) => track.albumId === id);
        return <fieldset key={id} className="rounded-xl border p-4" disabled={busy}>
          <legend>{name}</legend>
          <label><input type="checkbox" checked={rows.every((track) => selected.includes(track.audioItemId))} onChange={(event) => toggle(rows.map((track) => track.audioItemId), event.target.checked)} /> Весь альбом ({rows.length})</label>
          <details><summary>Выбрать треки</summary>{rows.map((track) => <label key={track.audioItemId} className="block">
            <input type="checkbox" checked={selected.includes(track.audioItemId)} onChange={(event) => toggle([track.audioItemId], event.target.checked)} /> {track.title}
          </label>)}</details>
        </fieldset>;
      })}
      {!tracks.length ? <p>Нет допущенных записей закрытого каталога. Завершите загрузку, проверку паспортов, качества и направления «cafe».</p> : null}
      <button type="submit" className="rounded bg-violet-700 px-4 py-2 text-white" disabled={busy || !selected.length}>Создать подборку и ссылку</button>
    </form>
    {link ? <div role="status" className="rounded border p-4">
      <p>Сохраните ссылку и отправьте владельцу и приглашённым слушателям. Она работает на нескольких устройствах. Новая ссылка показана только сейчас; при перевыпуске прежняя перестаёт работать.</p>
      <input aria-label="Персональная ссылка" className="w-full border p-2" readOnly value={link} onFocus={(event) => event.target.select()} />
    </div> : null}
    {link ? <button type="button" className="underline" onClick={() => { void copyLink(); }}>Копировать ссылку</button> : null}
    {message ? <p role="alert">{message}</p> : null}
    <section><h2>Выданные подборки</h2>
      <ul>{collections.map((entry) => <li key={entry.id} className="flex items-center gap-4 py-2">
        <span>{entry.title}</span>
        {(entry.revoked_at && !regenerated.includes(entry.id)) || revoked.includes(entry.id) ? <span>Ссылка отозвана</span> : <button type="button" disabled={busy} className="underline" onClick={() => { void revoke(entry.id); }}>Отозвать ссылку</button>}
        <button type="button" disabled={busy} className="underline" onClick={() => { void regenerate(entry.id); }}>Перевыпустить ссылку</button>
      </li>)}</ul>
    </section>
  </div>;
}
