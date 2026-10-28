import Link from 'next/link';
import { requireAdminPermission } from '@/lib/admin/guard';
import { BUSINESS_SPACES } from '@/lib/business-workspace/spaces';
import { isSoundReviewStatus, SOUND_REVIEW_LABELS, type SoundReviewQueue } from '@/lib/business/track-sound-review';
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
  const artist = uuid(get('artist'));
  const album = uuid(get('album'));
  const db = await createClient();
  const [main, albumQueue, artistQueue] = await Promise.all([
    db.rpc('admin_business_sound_queue', {
      p_status: status || null, p_artist: artist, p_album: album, p_space: space || null, p_page: page,
    }),
    album ? db.rpc('admin_business_sound_queue', { p_album: album, p_page: 0 }) : Promise.resolve(null),
    artist ? db.rpc('admin_business_sound_queue', { p_artist: artist, p_page: 0 }) : Promise.resolve(null),
  ]);
  const { data, error } = main;
  if (error || !data) return <p role="alert">Не удалось загрузить очередь. Проверьте применение миграции и обновите страницу.</p>;
  const queue = data as SoundReviewQueue;
  const totalOf = (result: { data: unknown; error: unknown } | null) => {
    const total = (result?.data as { total?: unknown } | null)?.total;
    return result && !result.error && typeof total === 'number' ? total : null;
  };
  const href = (target: number, unchecked = false) => {
    const query = new URLSearchParams({ status: unchecked ? 'unchecked' : status, artist: get('artist'), album: get('album'), space, page: String(target) });
    return `/admin/business-track-review?${query}`;
  };
  return <section className="space-y-5 p-4">
    <h1 className="text-2xl font-semibold">Business – прослушивание треков</h1>
    <p>Решение о качестве звука. Коммерческие права проверяются отдельно. Причины доступны только администраторам.</p>
    <p>В очереди – опубликованные музыкальные треки альбомов с допуском хотя бы к одному пространству Business.</p>
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
    <ReviewQueue key={`${status}:${artist ?? ''}:${album ?? ''}:${space}`} rows={queue.rows} scope={{
      status, artist: artist ?? '', album: album ?? '', space, total: queue.total,
      albumTotal: totalOf(albumQueue), artistTotal: totalOf(artistQueue),
    }} />
    <nav className="flex gap-4" aria-label="Страницы очереди">
      {page > 0 && <Link href={href(page - 1)}>Назад</Link>}
      <span>Страница {page + 1} · Треков: {queue.total}</span>
      {(page + 1) * 100 < queue.total && <Link href={href(page + 1)}>Далее</Link>}
      {page > 0 && <Link href={href(0, true)}>К первому непроверенному</Link>}
    </nav>
  </section>;
}
