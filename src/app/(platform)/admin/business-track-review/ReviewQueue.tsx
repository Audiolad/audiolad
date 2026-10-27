'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SOUND_REVIEW_LABELS, SOUND_REVIEW_STATUSES, nextUnchecked, type SoundReviewHistory, type SoundReviewRow } from '@/lib/business/track-sound-review';
import { businessTrackReviewHistory, previewBusinessTrack, reviewBusinessTrack } from './actions';

const colors = { unchecked: 'text-neutral-600', approved: 'text-green-700', rejected: 'text-red-700' };
const date = (value: string | null) => value ? new Date(value).toLocaleString('ru-RU') : '–';
const duration = (seconds: number | null) => seconds == null ? '–' : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export default function ReviewQueue({ rows }: { rows: SoundReviewRow[] }) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(rows[0]?.id ?? null);
  const [source, setSource] = useState<{ id: string; identity: string; url: string } | null>(null);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const [fragment, setFragment] = useState(30);
  const [history, setHistory] = useState<{ id: string; entries: SoundReviewHistory[]; more: boolean } | null>(null);
  const [autoNext, setAutoNext] = useState(true);
  const end = useRef(30);
  const request = useRef(0);
  const current = rows.find((row) => row.id === active) ?? rows[0];

  function listen(row: SoundReviewRow) {
    setActive(row.id);
    setSource(null);
    setMessage('Получаем ссылку для прослушивания…');
    const token = ++request.current;
    startTransition(async () => {
      try {
        const result = await previewBusinessTrack(row.id, row.audio_identity);
        if (token !== request.current) return;
        if (result.ok) {
          setSource({ id: row.id, identity: row.audio_identity, url: result.url });
          setMessage('');
        } else setMessage('Аудио недоступно или заменено. Обновите очередь и повторите попытку.');
      } catch { setMessage('Не удалось начать прослушивание. Повторите попытку.'); }
    });
  }
  function showHistory(id: string, more = false) {
    startTransition(async () => {
      try {
        const entries = await businessTrackReviewHistory(id, more && history?.id === id ? history.entries.at(-1)?.id : undefined);
        setHistory({ id, entries: more && history?.id === id ? [...history.entries, ...entries] : entries, more: entries.length === 50 });
      } catch { setMessage('Не удалось загрузить историю.'); }
    });
  }
  return <div className="space-y-4">
    <p role="status" aria-live="polite">{message}</p>
    {current && <div className="sticky top-0 z-10 space-y-2 rounded border bg-white p-3">
      <p><b>{current.artist} · {current.title}</b> · {current.album}</p>
      <label>Фрагмент <select value={fragment} onChange={(e) => setFragment(Number(e.target.value))}>
        <option value={15}>15 с</option><option value={30}>30 с</option>
      </select></label>{' '}
      <button disabled={pending} className="underline" onClick={() => listen(current)}>Прослушать</button>{' '}
      <button disabled={pending || !nextUnchecked(rows, current.id)} className="underline" onClick={() => {
        const next = rows.find((row) => row.id === nextUnchecked(rows, current.id));
        if (next) listen(next);
      }}>Следующий непроверенный</button>{' '}
      <label><input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} /> Перейти к следующему после решения</label>
      {source?.id === current.id && source.identity === current.audio_identity && <audio
        key={`${source.id}:${source.identity}:${source.url}`} src={source.url} controls autoPlay preload="metadata"
        controlsList="nodownload" aria-label={`Прослушивание: ${current.title}`} className="w-full"
        onPlay={(e) => { end.current = e.currentTarget.currentTime + fragment; }}
        onSeeked={(e) => { end.current = e.currentTarget.currentTime + fragment; }}
        onTimeUpdate={(e) => { if (e.currentTarget.currentTime >= end.current) e.currentTarget.pause(); }}
        onError={() => setMessage('Ссылка истекла или аудио недоступно. Нажмите «Прослушать» ещё раз.')}
      />}
      <p className="text-sm text-neutral-600">Перемотайте к нужному месту. Плеер остановится через выбранные 15–30 с.</p>
    </div>}
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="text-left"><th>Артист</th><th>Альбом</th><th>Трек</th><th>Длительность</th><th>Статус / причина</th><th>Когда / кто</th><th>История</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={`${row.id}:${row.reviewed_at}:${row.audio_identity}`} className={row.id === current?.id ? 'bg-violet-50' : ''}>
        <td className="p-2">{row.artist}</td><td className="p-2">{row.album}</td>
        <td className="p-2"><button disabled={pending} className="text-left underline" onClick={() => listen(row)}>{row.title}</button></td>
        <td>{duration(row.duration_seconds)}</td>
        <td className="p-2"><form className="flex flex-wrap gap-2" action={(form) => {
          startTransition(async () => {
            try {
              const result = await reviewBusinessTrack({ id: row.id, status: String(form.get('status')), reason: String(form.get('reason') ?? ''), audioIdentity: row.audio_identity });
              setMessage(result.message);
              if (result.ok) {
                if (autoNext) {
                  ++request.current;
                  setSource(null);
                  setActive(nextUnchecked(rows, row.id));
                }
                setHistory(null);
                router.refresh();
              }
            } catch { setMessage('Решение не сохранено. Повторите попытку.'); }
          });
        }}>
          <select aria-label={`Статус: ${row.title}`} name="status" defaultValue={row.status} className={colors[row.status]}>
            {SOUND_REVIEW_STATUSES.map((s) => <option key={s} value={s}>{SOUND_REVIEW_LABELS[s]}</option>)}
          </select>
          <input name="reason" aria-label={`Внутренняя причина: ${row.title}`} placeholder="Причина (необязательно)" defaultValue={row.reason ?? ''} maxLength={2000} className="rounded border p-1" />
          <button disabled={pending} className="underline">Сохранить</button>
        </form></td>
        <td className="max-w-48 break-words p-2">{date(row.reviewed_at)}<br />{row.reviewed_by ?? (row.reviewed_at ? 'Система: замена аудио' : '–')}</td>
        <td><button disabled={pending} className="underline" onClick={() => showHistory(row.id)}>История</button></td>
      </tr>)}</tbody>
    </table></div>
    {!rows.length && <p>По этим фильтрам треков нет.</p>}
    {history && <section className="space-y-2 rounded border p-3" aria-label="История решений">
      <h2>История: {rows.find((row) => row.id === history.id)?.title}</h2>
      {history.entries.map((entry) => <p key={entry.id}>{date(entry.changed_at)} · {entry.changed_by ?? 'Система'} · {SOUND_REVIEW_LABELS[entry.old_status]} → {SOUND_REVIEW_LABELS[entry.new_status]} · {entry.reason ?? 'Без причины'}{entry.event === 'audio_replaced' ? ' · Замена аудио' : ''}</p>)}
      {!history.entries.length && <p>Решений пока нет.</p>}
      {history.more && <button disabled={pending} onClick={() => showHistory(history.id, true)}>Ещё 50</button>}
    </section>}
  </div>;
}
