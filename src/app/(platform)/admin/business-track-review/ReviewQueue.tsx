'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SOUND_REVIEW_LABELS, SOUND_REVIEW_STATUSES, isSoundReviewStatus, nextUnchecked, soundReviewStatusLabel, type SoundReviewHistory, type SoundReviewRow, type SoundReviewStatus } from '@/lib/business/track-sound-review';
import { soundReviewBulkConfirm, soundReviewSelectionCount, type SoundReviewQueueScope, type SoundReviewSelection } from '@/lib/business/track-sound-bulk';
import { businessTrackReviewHistory, previewBusinessTrack, reviewBusinessTrack, reviewBusinessTracksBulk } from './actions';

/** One silent sample. play() on it runs inside the click, before the preview URL exists. */
const REVIEW_PLAYER_PRIME = 'data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA';

const colors = { unchecked: 'text-neutral-600', approved: 'text-green-700', rejected: 'text-red-700' };
const date = (value: string | null) => value ? new Date(value).toLocaleString('ru-RU') : '–';
const duration = (seconds: number | null) => seconds == null ? '–' : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const KEYS: Record<string, SoundReviewStatus> = { '1': 'approved', '2': 'rejected', '3': 'unchecked' };
const PLAYER_DECISIONS: SoundReviewStatus[] = ['approved', 'rejected', 'unchecked'];

type SavedDecision = { status: SoundReviewStatus; reason: string; identity: string };

function projectRows(rows: readonly SoundReviewRow[], saved: Record<string, SavedDecision>) {
  return rows.map((row) => {
    const patch = saved[row.id];
    if (!patch || patch.identity !== row.audio_identity) return row;
    return { ...row, status: patch.status, reason: patch.reason.trim() ? patch.reason : null };
  });
}

function isTypingTarget(target: EventTarget | null) {
  if (!target || typeof target !== 'object' || !('tagName' in target)) return false;
  const tag = String((target as { tagName?: string }).tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT' || (target as { isContentEditable?: boolean }).isContentEditable === true) return true;
  if (tag !== 'INPUT') return false;
  const type = String((target as { type?: string }).type ?? 'text').toLowerCase();
  return type !== 'checkbox' && type !== 'radio' && type !== 'button' && type !== 'submit';
}

function gesturePlay(audio: HTMLAudioElement | null, url?: string) {
  if (!audio || typeof audio.play !== 'function') return;
  if (url) audio.src = url;
  else if (!audio.src) audio.src = REVIEW_PLAYER_PRIME;
  const pending = audio.play();
  if (pending && typeof pending.catch === 'function') void pending.catch(() => {});
}

function decisionClass(status: SoundReviewStatus, pressed: boolean) {
  const base = 'inline-flex h-8 items-center rounded-md px-2.5 text-sm font-semibold disabled:opacity-60';
  const ring = pressed ? 'ring-2 ring-offset-1 ring-[#25135c]' : '';
  if (status === 'approved') return `${base} bg-green-700 text-white ${ring}`;
  if (status === 'rejected') return `${base} border border-red-700 bg-white text-red-700 ${ring}`;
  return `${base} border border-neutral-400 bg-white text-neutral-800 ${ring}`;
}

export default function ReviewQueue({ rows, scope }: { rows: SoundReviewRow[]; scope?: SoundReviewQueueScope }) {
  const queueScope: SoundReviewQueueScope = scope ?? {
    status: '', artist: '', album: '', space: '', total: rows.length, albumTotal: null, artistTotal: null,
  };
  const router = useRouter();
  const [saved, setSaved] = useState<Record<string, SavedDecision>>({});
  const view = projectRows(rows, saved);
  const [active, setActive] = useState<string | null>(view[0]?.id ?? null);
  const [source, setSource] = useState<{ id: string; identity: string; url: string } | null>(null);
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fragment, setFragment] = useState(30);
  const [history, setHistory] = useState<{ id: string; entries: SoundReviewHistory[]; more: boolean } | null>(null);
  const [autoNext, setAutoNext] = useState(true);
  const [selection, setSelection] = useState<SoundReviewSelection>({ kind: 'none' });
  const [bulkStatus, setBulkStatus] = useState<SoundReviewStatus>('approved');
  const [bulkReason, setBulkReason] = useState('');
  const selectedCount = soundReviewSelectionCount(selection, queueScope);
  const end = useRef(30);
  const request = useRef(0);
  const saving = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const readyRef = useRef(new Map<string, string>());
  const current = view.find((row) => row.id === active) ?? view[0];
  const audible = Boolean(current && source && source.url && !source.url.startsWith('data:') && source.id === current.id && source.identity === current.audio_identity);

  function say(text: string, error = false) {
    setMessage(text);
    setMessageError(error);
  }

  function listen(row: SoundReviewRow, note = '', gesture = false) {
    setActive(row.id);
    const key = `${row.id}:${row.audio_identity}`;
    const token = ++request.current;
    const cached = readyRef.current.get(key);
    const audio = audioRef.current;
    if (cached) {
      gesturePlay(audio, cached);
      setSource({ id: row.id, identity: row.audio_identity, url: cached });
      say(note);
      return;
    }
    // The signed URL arrives after this click. play() has to start in the gesture itself.
    if (gesture) {
      gesturePlay(audio);
      setSource({ id: row.id, identity: row.audio_identity, url: REVIEW_PLAYER_PRIME });
    }
    say(note || 'Получаем ссылку для прослушивания…');
    startTransition(async () => {
      try {
        const result = await previewBusinessTrack(row.id, row.audio_identity);
        if (token !== request.current) return;
        if (result.ok) {
          readyRef.current.set(key, result.url);
          gesturePlay(audioRef.current, result.url);
          setSource({ id: row.id, identity: row.audio_identity, url: result.url });
          say(note);
        } else {
          if (typeof audioRef.current?.pause === 'function') audioRef.current.pause();
          setSource(null);
          say('Аудио недоступно или заменено. Обновите очередь и повторите попытку.', true);
        }
      } catch { say('Не удалось начать прослушивание. Повторите попытку.', true); }
    });
  }

  function remember(row: SoundReviewRow, status: SoundReviewStatus, reasonText: string) {
    const patch = { status, reason: reasonText, identity: row.audio_identity };
    const nextSaved = { ...saved, [row.id]: patch };
    setSaved(nextSaved);
    return projectRows(rows, nextSaved);
  }

  function decide(row: SoundReviewRow, status: SoundReviewStatus) {
    if (saving.current) return;
    saving.current = true;
    const identity = row.audio_identity;
    startTransition(async () => {
      try {
        const result = await reviewBusinessTrack({ id: row.id, status, reason: '', audioIdentity: identity });
        if (!result.ok) {
          say(result.message, true);
          return;
        }
        const projected = remember(row, status, '');
        setHistory((open) => open?.id === row.id ? null : open);
        router.refresh();
        if (!autoNext) {
          say(result.message);
          return;
        }
        const next = projected.find((item) => item.id === nextUnchecked(projected, row.id));
        if (!next) {
          say(result.message);
          return;
        }
        listen(next, result.message);
      } catch {
        say('Решение не сохранено. Повторите попытку.', true);
      } finally {
        saving.current = false;
      }
    });
  }

  const decideRef = useRef(decide);
  const currentRef = useRef(current);
  useEffect(() => {
    decideRef.current = decide;
    currentRef.current = current;
  }, [decide, current]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (isTypingTarget(event.target)) return;
      const status = KEYS[event.key];
      const row = currentRef.current;
      if (!status || !row) return;
      event.preventDefault();
      decideRef.current(row, status);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function rowChecked(id: string) {
    if (selection.kind === 'ids') return selection.ids.includes(id);
    if (selection.kind === 'none') return false;
    return !selection.excludedIds.includes(id);
  }
  function toggleRow(id: string, checked: boolean) {
    setSelection((current) => {
      if (current.kind === 'none' || current.kind === 'ids') {
        const ids = new Set(current.kind === 'ids' ? current.ids : []);
        if (checked) ids.add(id);
        else ids.delete(id);
        return ids.size ? { kind: 'ids', ids: [...ids] } : { kind: 'none' };
      }
      const excludedIds = current.excludedIds.filter((item) => item !== id);
      if (!checked) excludedIds.push(id);
      return { ...current, excludedIds };
    });
  }
  function applyBulk() {
    if (!selectedCount || saving.current) return;
    if (!window.confirm(soundReviewBulkConfirm(SOUND_REVIEW_LABELS[bulkStatus], selectedCount))) return;
    const chosen = selection;
    saving.current = true;
    startTransition(async () => {
      try {
        const scope = chosen.kind === 'ids'
          ? { kind: 'ids' as const, ids: chosen.ids }
          : chosen.kind === 'album'
            ? { kind: 'album' as const, albumId: queueScope.album, excludedIds: chosen.excludedIds }
            : chosen.kind === 'artist'
              ? { kind: 'artist' as const, artistId: queueScope.artist, excludedIds: chosen.excludedIds }
              : chosen.kind === 'filter'
                ? { kind: 'filter' as const, status: queueScope.status, artist: queueScope.artist, album: queueScope.album, space: queueScope.space, excludedIds: chosen.excludedIds }
                : null;
        if (!scope) return;
        const result = await reviewBusinessTracksBulk({ scope, status: bulkStatus, reason: bulkReason });
        say(result.message, !result.ok);
        if (result.saved > 0) {
          setSaved({});
          setSelection({ kind: 'none' });
          setHistory(null);
          router.refresh();
        }
      } catch {
        say('Решение не сохранено. Повторите попытку.', true);
      } finally {
        saving.current = false;
      }
    });
  }
  function showHistory(id: string, more = false) {
    startTransition(async () => {
      try {
        const entries = await businessTrackReviewHistory(id, more && history?.id === id ? history.entries.at(-1)?.id : undefined);
        setHistory({ id, entries: more && history?.id === id ? [...history.entries, ...entries] : entries, more: entries.length === 50 });
      } catch { say('Не удалось загрузить историю.', true); }
    });
  }

  return <div className="max-w-full space-y-4">
    <p role={messageError ? 'alert' : 'status'} aria-live={messageError ? 'assertive' : 'polite'} className={messageError ? 'text-red-700' : ''}>{message}</p>
    {current && <div className="sticky top-0 z-10 max-w-full space-y-3 rounded border bg-white p-3">
      <p className="break-words"><b>{current.artist} · {current.title}</b> · {current.album}</p>
      <p>Сейчас: <b data-sound-status={current.sound_auto && current.status !== 'rejected' ? 'artist_auto' : current.status} className={colors[current.sound_auto && current.status !== 'rejected' ? 'approved' : current.status]}>{soundReviewStatusLabel(current)}</b></p>
      <div className="flex max-w-full flex-wrap gap-2">
        {PLAYER_DECISIONS.map((status) => <button
          key={status} type="button" disabled={pending} aria-pressed={current.status === status}
          className={decisionClass(status, current.status === status)}
          onClick={() => decide(current, status)}
        >{SOUND_REVIEW_LABELS[status]}</button>)}
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-2">
        <label>Фрагмент <select value={fragment} onChange={(e) => setFragment(Number(e.target.value))}>
          <option value={15}>15 с</option><option value={30}>30 с</option>
        </select></label>
        <button type="button" disabled={pending} aria-label="Прослушать" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#25135c] px-3 text-sm font-semibold text-white disabled:opacity-60" onClick={() => listen(current, '', true)}><svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 fill-current"><path d="M2.2 1.1v9.8L10.8 6 2.2 1.1z" /></svg>Прослушать</button>
        <button type="button" disabled={pending || !nextUnchecked(view, current.id)} className="underline" onClick={() => {
          const next = view.find((row) => row.id === nextUnchecked(view, current.id));
          if (next) listen(next, '', true);
        }}>Следующий непроверенный</button>
        <label className="max-w-full"><input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} /> Перейти к следующему после решения</label>
      </div>
      <audio
        ref={audioRef}
        src={source?.id === current.id && source.identity === current.audio_identity ? source.url : undefined}
        controls={audible}
        autoPlay={audible}
        preload="metadata"
        controlsList="nodownload"
        aria-label={`Прослушивание: ${current.title}`}
        className={audible ? 'w-full max-w-full' : 'sr-only'}
        onPlay={(e) => { end.current = e.currentTarget.currentTime + fragment; }}
        onSeeked={(e) => { end.current = e.currentTarget.currentTime + fragment; }}
        onTimeUpdate={(e) => { if (e.currentTarget.currentTime >= end.current) e.currentTarget.pause(); }}
        onError={() => {
          if ((audioRef.current?.src ?? '').startsWith('data:')) return;
          say('Ссылка истекла или аудио недоступно. Нажмите «Прослушать» ещё раз.', true);
        }}
      />
    </div>}
    <div className="flex max-w-full flex-wrap items-center gap-2 rounded border p-3">
      <p>Выбрано: {selectedCount}</p>
      <button type="button" className="underline" disabled={pending || queueScope.total === 0} onClick={() => setSelection({ kind: 'filter', excludedIds: [] })}>Выбрать все по этому фильтру</button>
      {queueScope.album ? <button type="button" className="underline" disabled={pending || !queueScope.albumTotal} onClick={() => setSelection({ kind: 'album', excludedIds: [] })}>Выбрать весь альбом</button> : null}
      {queueScope.artist ? <button type="button" className="underline" disabled={pending || !queueScope.artistTotal} onClick={() => setSelection({ kind: 'artist', excludedIds: [] })}>Выбрать всего артиста</button> : null}
      <label>Статус <select aria-label="Статус для выбранных" value={bulkStatus} onChange={(event) => { if (isSoundReviewStatus(event.target.value)) setBulkStatus(event.target.value); }}>
        {PLAYER_DECISIONS.map((status) => <option key={status} value={status}>{SOUND_REVIEW_LABELS[status]}</option>)}
      </select></label>
      <input aria-label="Причина для выбранных" placeholder="Причина (необязательно)" maxLength={2000} value={bulkReason} onChange={(event) => setBulkReason(event.target.value)} className="w-full max-w-full rounded border p-2 sm:w-auto" />
      <button type="button" className="rounded border px-3 py-2" disabled={pending || selectedCount === 0} onClick={applyBulk}>Применить к выбранным</button>
    </div>
    <div className="max-w-full overflow-x-auto"><table className="w-full min-w-0 text-sm">
      <thead><tr className="text-left"><th className="p-2"><input type="checkbox" aria-label="Выбрать все по этому фильтру" checked={selection.kind === 'filter' && selection.excludedIds.length === 0 && queueScope.total > 0} disabled={pending || queueScope.total === 0} onChange={(event) => setSelection(event.target.checked ? { kind: 'filter', excludedIds: [] } : { kind: 'none' })} /></th><th>Артист</th><th>Альбом</th><th>Трек</th><th>Длительность</th><th>Статус / причина</th><th>Когда / кто</th><th>История</th></tr></thead>
      <tbody>{view.map((row) => <tr key={`${row.id}:${row.status}:${row.reason ?? ''}:${row.audio_identity}`} className={row.id === current?.id ? 'bg-violet-50' : ''}>
        <td className="p-2"><input type="checkbox" aria-label={`Выбрать ${row.title}`} checked={rowChecked(row.id)} disabled={pending} onChange={(event) => toggleRow(row.id, event.target.checked)} /></td>
        <td className="p-2">{row.artist}</td><td className="p-2">{row.album}</td>
        <td className="p-2"><button type="button" disabled={pending} className="text-left underline" onClick={() => listen(row, '', true)}>{row.title}</button></td>
        <td>{duration(row.duration_seconds)}</td>
        <td className="p-2"><p className={colors[row.sound_auto && row.status !== 'rejected' ? 'approved' : row.status]}>{soundReviewStatusLabel(row)}</p><form className="flex max-w-full flex-wrap gap-2" action={(form) => {
          const status = String(form.get('status'));
          const reasonText = String(form.get('reason') ?? '');
          if (!isSoundReviewStatus(status)) {
            say('Проверьте поля решения.', true);
            return;
          }
          startTransition(async () => {
            try {
              const result = await reviewBusinessTrack({ id: row.id, status, reason: reasonText, audioIdentity: row.audio_identity });
              say(result.message, !result.ok);
              if (!result.ok) return;
              const projected = remember(row, status, reasonText);
              if (autoNext) {
                ++request.current;
                setSource(null);
                setActive(nextUnchecked(projected, row.id));
              }
              setHistory(null);
              router.refresh();
            } catch { say('Решение не сохранено. Повторите попытку.', true); }
          });
        }}>
          <select aria-label={`Статус: ${row.title}`} name="status" defaultValue={row.status} className={colors[row.status]}>
            {SOUND_REVIEW_STATUSES.map((s) => <option key={s} value={s}>{SOUND_REVIEW_LABELS[s]}</option>)}
          </select>
          <input name="reason" aria-label={`Внутренняя причина: ${row.title}`} placeholder="Причина (необязательно)" defaultValue={row.reason ?? ''} maxLength={2000} className="max-w-full rounded border p-1" />
          <button type="submit" disabled={pending} className="underline">Сохранить</button>
        </form></td>
        <td className="max-w-48 break-words p-2">{date(row.reviewed_at)}<br />{row.reviewed_by ?? (row.reviewed_at ? 'Система: замена аудио' : '–')}</td>
        <td><button type="button" disabled={pending} className="underline" onClick={() => showHistory(row.id)}>История</button></td>
      </tr>)}</tbody>
    </table></div>
    {!view.length && <p>По этим фильтрам треков нет.</p>}
    {history && <section className="space-y-2 rounded border p-3" aria-label="История решений">
      <h2>История: {view.find((row) => row.id === history.id)?.title}</h2>
      {history.entries.map((entry) => <p key={entry.id}>{date(entry.changed_at)} · {entry.changed_by ?? 'Система'} · {SOUND_REVIEW_LABELS[entry.old_status]} → {SOUND_REVIEW_LABELS[entry.new_status]} · {entry.reason ?? 'Без причины'}{entry.event === 'audio_replaced' ? ' · Замена аудио' : ''}</p>)}
      {!history.entries.length && <p>Решений пока нет.</p>}
      {history.more && <button type="button" disabled={pending} onClick={() => showHistory(history.id, true)}>Ещё 50</button>}
    </section>}
  </div>;
}
