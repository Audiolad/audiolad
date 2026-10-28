'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SOUND_REVIEW_LABELS, SOUND_REVIEW_STATUSES, isSoundReviewStatus, nextUnchecked, type SoundReviewHistory, type SoundReviewRow, type SoundReviewStatus } from '@/lib/business/track-sound-review';
import { businessTrackReviewHistory, previewBusinessTrack, reviewBusinessTrack } from './actions';

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
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target as { isContentEditable?: boolean }).isContentEditable === true;
}

function decisionClass(status: SoundReviewStatus, pressed: boolean) {
  const base = 'min-h-11 min-w-[8.75rem] max-w-full flex-1 rounded-md px-4 py-3 text-base font-semibold disabled:opacity-60 sm:flex-none sm:px-8';
  const ring = pressed ? 'ring-2 ring-offset-2 ring-[#25135c]' : '';
  if (status === 'approved') return `${base} bg-green-700 text-white ${ring}`;
  if (status === 'rejected') return `${base} border border-red-700 bg-white text-red-700 ${ring}`;
  return `${base} border border-neutral-400 bg-white text-neutral-800 ${ring}`;
}

export default function ReviewQueue({ rows }: { rows: SoundReviewRow[] }) {
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
  const [reason, setReason] = useState(view[0]?.reason ?? '');
  const [reasonKey, setReasonKey] = useState(view[0] ? `${view[0].id}:${view[0].audio_identity}` : '');
  const end = useRef(30);
  const request = useRef(0);
  const saving = useRef(false);
  const current = view.find((row) => row.id === active) ?? view[0];
  const trackKey = current ? `${current.id}:${current.audio_identity}` : '';
  if (reasonKey !== trackKey) {
    setReasonKey(trackKey);
    setReason(current?.reason ?? '');
  }

  function say(text: string, error = false) {
    setMessage(text);
    setMessageError(error);
  }

  function listen(row: SoundReviewRow, note = '') {
    setActive(row.id);
    setSource(null);
    say('Получаем ссылку для прослушивания…');
    const token = ++request.current;
    startTransition(async () => {
      try {
        const result = await previewBusinessTrack(row.id, row.audio_identity);
        if (token !== request.current) return;
        if (result.ok) {
          setSource({ id: row.id, identity: row.audio_identity, url: result.url });
          say(note);
        } else say('Аудио недоступно или заменено. Обновите очередь и повторите попытку.', true);
      } catch { say('Не удалось начать прослушивание. Повторите попытку.', true); }
    });
  }

  function remember(row: SoundReviewRow, status: SoundReviewStatus, reasonText: string) {
    const patch = { status, reason: reasonText, identity: row.audio_identity };
    const nextSaved = { ...saved, [row.id]: patch };
    setSaved(nextSaved);
    return projectRows(rows, nextSaved);
  }

  function decide(row: SoundReviewRow, status: SoundReviewStatus, reasonText: string) {
    if (saving.current) return;
    saving.current = true;
    const identity = row.audio_identity;
    startTransition(async () => {
      try {
        const result = await reviewBusinessTrack({ id: row.id, status, reason: reasonText, audioIdentity: identity });
        if (!result.ok) {
          say(result.message, true);
          return;
        }
        const projected = remember(row, status, reasonText);
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
  decideRef.current = decide;
  const currentRef = useRef(current);
  currentRef.current = current;
  const reasonRef = useRef(reason);
  reasonRef.current = reason;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (isTypingTarget(event.target)) return;
      const status = KEYS[event.key];
      const row = currentRef.current;
      if (!status || !row) return;
      event.preventDefault();
      decideRef.current(row, status, reasonRef.current);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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
      <p>Сейчас: <b data-sound-status={current.status} className={colors[current.status]}>{SOUND_REVIEW_LABELS[current.status]}</b></p>
      <div className="flex max-w-full flex-wrap gap-2">
        {PLAYER_DECISIONS.map((status) => <button
          key={status} type="button" disabled={pending} aria-pressed={current.status === status}
          className={decisionClass(status, current.status === status)}
          onClick={() => decide(current, status, reason)}
        >{SOUND_REVIEW_LABELS[status]}</button>)}
      </div>
      <input
        aria-label={`Причина текущего трека: ${current.title}`}
        placeholder="Причина (необязательно)"
        maxLength={2000}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className="w-full max-w-full rounded border p-2"
      />
      <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-2">
        <label>Фрагмент <select value={fragment} onChange={(e) => setFragment(Number(e.target.value))}>
          <option value={15}>15 с</option><option value={30}>30 с</option>
        </select></label>
        <button type="button" disabled={pending} className="underline" onClick={() => listen(current)}>Прослушать</button>
        <button type="button" disabled={pending || !nextUnchecked(view, current.id)} className="underline" onClick={() => {
          const next = view.find((row) => row.id === nextUnchecked(view, current.id));
          if (next) listen(next);
        }}>Следующий непроверенный</button>
        <label className="max-w-full"><input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} /> Перейти к следующему после решения</label>
      </div>
      {source?.id === current.id && source.identity === current.audio_identity && <audio
        key={`${source.id}:${source.identity}:${source.url}`} src={source.url} controls autoPlay preload="metadata"
        controlsList="nodownload" aria-label={`Прослушивание: ${current.title}`} className="w-full max-w-full"
        onPlay={(e) => { end.current = e.currentTarget.currentTime + fragment; }}
        onSeeked={(e) => { end.current = e.currentTarget.currentTime + fragment; }}
        onTimeUpdate={(e) => { if (e.currentTarget.currentTime >= end.current) e.currentTarget.pause(); }}
        onError={() => say('Ссылка истекла или аудио недоступно. Нажмите «Прослушать» ещё раз.', true)}
      />}
      <p className="text-sm text-neutral-600">Перемотайте к нужному месту. Плеер остановится через выбранные 15–30 с.</p>
      <p className="text-sm text-neutral-600">1 – допущен, 2 – не допущен, 3 – не проверен. При вводе причины клавиши не срабатывают.</p>
    </div>}
    <div className="max-w-full overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="text-left"><th>Артист</th><th>Альбом</th><th>Трек</th><th>Длительность</th><th>Статус / причина</th><th>Когда / кто</th><th>История</th></tr></thead>
      <tbody>{view.map((row) => <tr key={`${row.id}:${row.status}:${row.reason ?? ''}:${row.audio_identity}`} className={row.id === current?.id ? 'bg-violet-50' : ''}>
        <td className="p-2">{row.artist}</td><td className="p-2">{row.album}</td>
        <td className="p-2"><button type="button" disabled={pending} className="text-left underline" onClick={() => listen(row)}>{row.title}</button></td>
        <td>{duration(row.duration_seconds)}</td>
        <td className="p-2"><form className="flex max-w-full flex-wrap gap-2" action={(form) => {
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
