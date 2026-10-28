import Link from 'next/link';
import { requireAdminPermission } from '@/lib/admin/guard';
import { BUSINESS_SPACES } from '@/lib/business-workspace/spaces';
import { loadAgreementSoundQueue } from '@/lib/business-admission/agreement.server';
import { isSoundReviewStatus, SOUND_REVIEW_LABELS } from '@/lib/business/track-sound-review';
import { createClient } from '@/lib/supabase/server';
import ReviewQueue from './ReviewQueue';

export const dynamic = 'force-dynamic';

export default async function BusinessTrackReviewPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission('author_products.moderate');
  const params = await searchParams;
  const get = (key: string) => typeof params[key] === 'string' ? params[key] as string : '';
  const status = isSoundReviewStatus(get('status')) ? get('status') : '';
  const uuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  const page = Math.max(0, Math.min(100000, Number.parseInt(get('page'), 10) || 0));
  const space = BUSINESS_SPACES.some((s) => s.id === get('space')) ? get('space') : '';
  const db = await createClient();
  const artist = uuid(get('artist')) ?? '';
  const album = uuid(get('album')) ?? '';
  let queue;
  try {
    queue = await loadAgreementSoundQueue(db, { status, artist, album, space, page });
  } catch {
    return <p role="alert">Не удалось загрузить очередь. Проверьте применение миграции и обновите страницу.</p>;
  }
  const href = (target: number, unchecked = false) => {
    const query = new URLSearchParams({ status: unchecked ? 'unchecked' : status, artist: get('artist'), album: get('album'), space, page: String(target) });
    return `/admin/business-track-review?${query}`;
  };
  return <section className="space-y-5 p-4">
    <h1 className="text-2xl font-semibold">Business – прослушивание треков</h1>
    <p>Решение о качестве звука. Коммерческие права проверяются отдельно. Причины доступны только администраторам.</p>
    <p>В очереди – опубликованные музыкальные треки альбомов с допуском хотя бы к одному пространству Business.</p>
    <p>В очереди только треки авторов с подтверждёнными правами – {queue.total}.{" "}
      <Link className="underline" href="/admin/business-verification">Проверка правообладателей и лицензий</Link></p>
    {!queue.total && !status && !artist && !album && !space && <p>Пока нет авторов с подтверждёнными правами.{" "}
      <Link className="underline" href="/admin/business-verification">Проверка правообладателей и лицензий</Link></p>}
    <p>Ожидают: {queue.counts.unchecked} · Допущено: {queue.counts.approved} · Отклонено: {queue.counts.rejected}</p>
    <form className="flex flex-wrap gap-3">
      <label>Статус <select name="status" defaultValue={status}><option value="">Все</option>
        {Object.entries(SOUND_REVIEW_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <label>Артист <select name="artist" defaultValue={get('artist')}><option value="">Все</option>
        {queue.artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select></label>
      <label>Альбом <select name="album" defaultValue={get('album')}><option value="">Все</option>
        {queue.albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select></label>
      <label>Пространство <select name="space" defaultValue={space}><option value="">Все</option>
        {BUSINESS_SPACES.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select></label>
      <button className="underline">Применить</button><Link href="/admin/business-track-review">Сбросить</Link>
    </form>
    <Link className="underline" href={href(0, true)}>Режим «Следующий непроверенный»</Link>
    <ReviewQueue key={`${status}:${get('artist')}:${get('album')}:${space}:${page}`} rows={queue.rows} />
    <nav className="flex gap-4" aria-label="Страницы очереди">
      {page > 0 && <Link href={href(page - 1)}>Назад</Link>}
      <span>Страница {page + 1} · Треков: {queue.total}</span>
      {(page + 1) * 100 < queue.total && <Link href={href(page + 1)}>Далее</Link>}
      {page > 0 && <Link href={href(0, true)}>К первому непроверенному</Link>}
    </nav>
  </section>;
}
