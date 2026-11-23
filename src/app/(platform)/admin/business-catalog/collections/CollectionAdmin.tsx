"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { COLLECTION_ACCOUNT_LIMIT, type CollectionTrack } from "@/lib/business-collections/model";
import { VOCAL_ALBUM_LABEL } from "@/lib/business-catalog/vocals";
import { COLLECTION_SHARE_PRESETS, collectionShareLabel, normalizeCollectionSharePercent } from "@/lib/business-collections/similar-mix.mjs";
import { createCollection, revokeCollection, regenerateCollection, saveCollectionShare } from "./actions";

export type CollectionSimilarTrack = { audioItemId?: string; title: string; albumTitle: string };

export type CollectionEntry = {
  id: string;
  title: string;
  revoked_at: string | null;
  created_at: string;
  usedCount: number | null;
  sharePercent: number;
  similar: CollectionSimilarTrack[];
};

type FreshLink = { collectionId: string; title: string; url: string };

function issuedStatus(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Ссылка действует";
  const text = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(date);
  return `Ссылка действует, выдана ${text}`;
}

function LinkBox({ fresh, copied, onCopy }: { fresh: FreshLink; copied: boolean; onCopy: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const box = document.getElementById(`collection-link-${fresh.collectionId}`);
    box?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [fresh.collectionId, fresh.url]);
  return (
    <div
      id={`collection-link-${fresh.collectionId}`}
      role="status"
      className="mt-3 rounded-xl border border-[#c9b4e8] bg-[#faf6ff] p-3 sm:p-4"
    >
      <h3 className="text-base font-semibold text-[#25135c]">Ссылка для подборки «{fresh.title}»</h3>
      <p className="mt-2 text-sm leading-6 text-[#5f5484]">
        Ссылка показана только один раз – сейчас. Сохраните её и отправьте владельцу. Если потеряете,
        нажмите «Перевыпустить» рядом с этой подборкой: старая ссылка перестанет открываться.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          aria-label={`Ссылка для подборки «${fresh.title}»`}
          className="min-w-0 w-full rounded-xl border border-[#d9cdef] bg-white p-2 text-sm"
          readOnly
          value={fresh.url}
          onFocus={(event) => event.target.select()}
        />
        <button
          type="button"
          className="shrink-0 rounded-xl bg-violet-700 px-4 py-2 text-white"
          onClick={onCopy}
        >
          {copied ? "Скопировано" : "Копировать ссылку"}
        </button>
      </div>
      {copied ? <p className="mt-2 text-sm font-medium text-[#25135c]">Скопировано</p> : null}
    </div>
  );
}

export default function CollectionAdmin({ tracks, collections }: { tracks: CollectionTrack[]; collections: CollectionEntry[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [created, setCreated] = useState<CollectionEntry[]>([]);
  const [fresh, setFresh] = useState<FreshLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [regenerated, setRegenerated] = useState<string[]>([]);
  const [revoked, setRevoked] = useState<string[]>([]);
  const [shareById, setShareById] = useState<Record<string, number>>({});
  const [shareDraft, setShareDraft] = useState<Record<string, string>>({});
  const albums = [...new Map(tracks.map((track) => [track.albumId, track.albumTitle])).entries()];
  const toggle = (ids: string[], checked: boolean) => setSelected((old) => checked ? [...new Set([...old, ...ids])] : old.filter((id) => !ids.includes(id)));
  const incomingIds = new Set(collections.map((entry) => entry.id));
  const list = [...created.filter((entry) => !incomingIds.has(entry.id)), ...collections];

  function resetFeedback() {
    setMessage(null);
    setCopied(false);
    setFresh(null);
  }

  async function create() {
    const name = title.trim();
    setBusy(true); resetFeedback();
    try {
      const result = await createCollection({ title: name, tracks: tracks.filter((track) => selected.includes(track.audioItemId)).map((track) => track.audioItemId) });
      if (result.ok) {
        if (result.id) {
          const entry: CollectionEntry = {
            id: result.id,
            title: result.title,
            revoked_at: null,
            created_at: result.createdAt,
            usedCount: 0,
            sharePercent: 50,
            similar: [],
          };
          setCreated((old) => [entry, ...old.filter((item) => item.id !== entry.id)]);
        }
        setFresh({ collectionId: result.id || "new", title: result.title, url: result.link });
        setSelected([]);
        setTitle("");
        router.refresh();
      } else setMessage(result.error);
    } catch { setMessage("Не удалось создать подборку. Повторите попытку."); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    setBusy(true); resetFeedback();
    try {
      if ((await revokeCollection(id)).ok) {
        setRevoked((old) => [...old, id]);
        setRegenerated((old) => old.filter((value) => value !== id));
        router.refresh();
      } else setMessage("Не удалось отозвать ссылку. Обновите страницу и повторите попытку.");
    } catch { setMessage("Не удалось отозвать ссылку."); }
    finally { setBusy(false); }
  }

  async function regenerate(id: string, name: string) {
    setBusy(true); resetFeedback();
    try {
      const result = await regenerateCollection(id);
      if (result.ok) {
        setRegenerated((old) => [...old, id]);
        setRevoked((old) => old.filter((value) => value !== id));
        setFresh({ collectionId: id, title: result.title || name, url: result.link });
        router.refresh();
      } else setMessage(result.error);
    } catch { setMessage("Не удалось перевыпустить ссылку."); }
    finally { setBusy(false); }
  }

  async function copyLink() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.url);
      setCopied(true);
      setMessage(null);
    } catch {
      setCopied(false);
      setMessage("Выделите и скопируйте ссылку из поля.");
    }
  }

  async function saveShare(id: string) {
    const percent = normalizeCollectionSharePercent(shareById[id] ?? list.find((entry) => entry.id === id)?.sharePercent);
    setBusy(true); setMessage(null);
    try {
      const result = await saveCollectionShare({ id, percent });
      if (result.ok) {
        setShareById((old) => ({ ...old, [id]: result.percent }));
        router.refresh();
      } else setMessage(result.error);
    } catch { setMessage("Не удалось сохранить долю. Повторите попытку."); }
    finally { setBusy(false); }
  }

  function isRevoked(entry: CollectionEntry): boolean {
    return (Boolean(entry.revoked_at) && !regenerated.includes(entry.id)) || revoked.includes(entry.id);
  }

  return <div className="space-y-6">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void create(); }}>
      <label className="block">Название подборки
        <input
          className="mt-2 w-full min-w-0 rounded border p-2 sm:mt-0 sm:ml-3 sm:w-auto"
          value={title}
          maxLength={120}
          required
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Подборка для заведения"
        />
      </label>
      <p>Выбрано: {selected.length} треков. Альбом можно выбрать целиком или раскрыть и выбрать отдельные записи.</p>
      {albums.map(([id, name]) => {
        const rows = tracks.filter((track) => track.albumId === id);
        const vocal = rows.some((track) => track.hasVocals === true);
        return <fieldset key={id} className="rounded-xl border p-4" disabled={busy}>
          <legend>{name}{vocal ? ` – ${VOCAL_ALBUM_LABEL}` : ""}</legend>
          <label><input type="checkbox" checked={rows.every((track) => selected.includes(track.audioItemId))} onChange={(event) => toggle(rows.map((track) => track.audioItemId), event.target.checked)} /> Весь альбом ({rows.length})</label>
          <details><summary>Выбрать треки</summary>{rows.map((track) => <label key={track.audioItemId} className="block">
            <input type="checkbox" checked={selected.includes(track.audioItemId)} onChange={(event) => toggle([track.audioItemId], event.target.checked)} /> {track.title}
          </label>)}</details>
        </fieldset>;
      })}
      {!tracks.length ? <p>Нет допущенных записей закрытого каталога. Завершите загрузку, проверку паспортов, качества и направления «cafe».</p> : null}
      <button type="submit" className="rounded bg-violet-700 px-4 py-2 text-white" disabled={busy || !selected.length}>Создать подборку и ссылку</button>
    </form>
    {message ? <p role="alert">{message}</p> : null}
    {fresh && !list.some((entry) => entry.id === fresh.collectionId) ? (
      <LinkBox fresh={fresh} copied={copied} onCopy={() => { void copyLink(); }} />
    ) : null}
    <section>
      <h2 className="text-xl font-semibold text-[#25135c]">Выданные подборки</h2>
      <p className="mt-2 text-sm leading-6 text-[#5f5484]">
        В списке нет готовой ссылки: мы храним только её защищённый след и не можем показать её повторно.
        Новую ссылку можно получить только через «Перевыпустить» у нужной подборки – тогда прежняя перестанет открываться.
      </p>
      {list.length ? (
        <ul className="mt-4 space-y-3">
          {list.map((entry) => {
            const revokedNow = isRevoked(entry);
            const linkForRow = fresh?.collectionId === entry.id ? fresh : null;
            return (
              <li key={entry.id} className="rounded-xl border border-[#eadff8] bg-white p-4">
                <p className="text-base font-semibold text-[#25135c]">{entry.title}</p>
                <p className="mt-1 text-sm leading-6">{revokedNow ? "Ссылка отозвана" : issuedStatus(entry.created_at)}</p>
                {entry.usedCount !== null ? (
                  <p className="mt-1 text-sm leading-6">Воспользовались: {entry.usedCount} из {COLLECTION_ACCOUNT_LIMIT}</p>
                ) : null}
                <div className="mt-3 rounded-lg bg-[#faf6ff] p-3">
                  <p className="text-sm font-medium text-[#25135c]">Доля подборки после оплаты</p>
                  <p className="mt-1 text-sm leading-6 text-[#5f5484]">
                    После оплаты подборка остаётся основой, к ней подмешиваются похожие треки из закрытого каталога. До оплаты играет только подборка.
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <label className="text-sm">Соотношение
                      <select
                        className="ml-2 rounded border border-[#d9cdef] bg-white p-1.5"
                        disabled={busy}
                        value={shareById[entry.id] ?? entry.sharePercent}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          setShareById((old) => ({ ...old, [entry.id]: value }));
                          setShareDraft((old) => ({ ...old, [entry.id]: String(value) }));
                        }}
                      >
                        {(() => {
                          const current = shareById[entry.id] ?? entry.sharePercent;
                          const values = COLLECTION_SHARE_PRESETS.includes(current) ? COLLECTION_SHARE_PRESETS : [...COLLECTION_SHARE_PRESETS, current].sort((a, b) => a - b);
                          return values.map((percent) => (
                            <option key={percent} value={percent}>{collectionShareLabel(percent)}</option>
                          ));
                        })()}
                      </select>
                    </label>
                    <label className="text-sm">Или число от 50 до 95
                      <input
                        type="number"
                        min={50}
                        max={95}
                        step={1}
                        className="ml-2 w-20 rounded border border-[#d9cdef] bg-white p-1.5"
                        disabled={busy}
                        value={shareDraft[entry.id] ?? String(shareById[entry.id] ?? entry.sharePercent)}
                        onChange={(event) => setShareDraft((old) => ({ ...old, [entry.id]: event.target.value }))}
                        onBlur={(event) => {
                          const value = Number(event.target.value);
                          if (Number.isInteger(value) && value >= 50 && value <= 95) {
                            setShareById((old) => ({ ...old, [entry.id]: value }));
                            setShareDraft((old) => ({ ...old, [entry.id]: String(value) }));
                          } else {
                            setShareDraft((old) => ({ ...old, [entry.id]: String(shareById[entry.id] ?? entry.sharePercent) }));
                          }
                        }}
                      />
                    </label>
                    <button type="button" disabled={busy} className="underline" onClick={() => { void saveShare(entry.id); }}>
                      Сохранить долю
                    </button>
                  </div>
                  <p className="mt-2 text-sm leading-6">После оплаты: {entry.similar.length} похожих треков</p>
                  {entry.similar.length ? (
                    <details className="mt-1 text-sm leading-6">
                      <summary>Какие треки подмешаются</summary>
                      <ol className="mt-2 space-y-1">
                        {entry.similar.map((track, index) => (
                          <li key={track.audioItemId || `${track.title}-${index}`}>{track.title} – {track.albumTitle}</li>
                        ))}
                      </ol>
                    </details>
                  ) : (
                    <p className="mt-1 text-sm leading-6 text-[#5f5484]">Похожих треков пока нет: в каталоге нет достаточно близких записей, или подборка только что создана – обновите страницу.</p>
                  )}
                </div>
                <p className="mt-3 text-sm leading-6 text-[#5f5484]">
                  Саму ссылку мы не храним. Получить её снова можно только через «Перевыпустить» – тогда прежняя перестанет открываться.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  {revokedNow ? null : (
                    <button type="button" disabled={busy} className="underline" onClick={() => { void revoke(entry.id); }}>
                      Отозвать ссылку
                    </button>
                  )}
                  <button type="button" disabled={busy} className="underline" onClick={() => { void regenerate(entry.id, entry.title); }}>
                    Перевыпустить ссылку
                  </button>
                </div>
                {linkForRow ? <LinkBox fresh={linkForRow} copied={copied} onCopy={() => { void copyLink(); }} /> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[#5f5484]">Пока нет выданных подборок.</p>
      )}
    </section>
  </div>;
}
