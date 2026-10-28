import Link from 'next/link';
import { requireAdminPermission } from '@/lib/admin/guard';
import { listSectorAlbums, loadAgreementSoundQueue } from '@/lib/business-admission/agreement.server';
import { sectorChecked, sectorInherited } from '@/lib/business-admission/sectors';
import { isSoundReviewStatus, SOUND_REVIEW_LABELS } from '@/lib/business/track-sound-review';
import { createClient } from '@/lib/supabase/server';
import { saveAlbumSectors } from './actions';
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
  const space = /^[a-z][a-z0-9_]{0,63}$/.test(get('space')) ? get('space') : '';
  const artist = uuid(get('artist')) ?? '';
  const album = uuid(get('album')) ?? '';
  const db = await createClient();
  let queue;
  let sectors: Awaited<ReturnType<typeof listSectorAlbums>> = { directions: [], albums: [] };
  try {
    queue = await loadAgreementSoundQueue(db, { status, artist, album, space, page });
    sectors = await listSectorAlbums(queue.rows.map((row) => row.album_id));
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
    <p>В очереди – опубликованные музыкальные треки альбомов с допуском хотя бы к одному сектору. Ниже можно задать секторы и альбомам без допуска.</p>
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
      <label>Сектор <select name="space" defaultValue={space}><option value="">Все</option>
        {sectors.directions.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
      </select></label>
      <button className="underline">Применить</button><Link href="/admin/business-track-review">Сбросить</Link>
    </form>
    <Link className="underline" href={href(0, true)}>Режим «Следующий непроверенный»</Link>
    {get('sectors') === 'saved' && <p role="status">Секторы альбомов сохранены.</p>}
    {get('sectors') === 'error' && <p role="alert" className="text-red-700">Секторы не сохранены. Повторите попытку.</p>}
    <div className="space-y-3 rounded border p-3">
      <p>Секторы альбомов. Снятие галочки у артиста с допуском пишет явный запрет альбома. «Как у артиста» возвращает наследование.</p>
      <form id="sector-bulk" action={saveAlbumSectors} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="status" value={status} /><input type="hidden" name="artist" value={artist} />
        <input type="hidden" name="album" value={album} /><input type="hidden" name="space" value={space} /><input type="hidden" name="page" value={page} />
        {sectors.directions.map((direction) => <label key={direction.key} className="inline-flex items-center gap-1 text-sm"><input type="checkbox" name="on" value={direction.key} />{direction.name}</label>)}
        <button type="submit" className="rounded border px-3 py-2">Применить к выбранным альбомам</button>
      </form>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th></th><th>Альбом</th>{sectors.directions.map((direction) => <th key={direction.key}>{direction.name}</th>)}<th></th></tr></thead>
        <tbody>{sectors.albums.map((item) => <tr key={item.id} className="border-t align-top">
          <td className="p-2"><input form="sector-bulk" type="checkbox" name="albumId" value={item.id} aria-label={`Выбрать альбом ${item.title}`} /></td>
          <td className="p-2">{item.title}<p className="text-neutral-500">{item.authorName}{item.admitted ? '' : ' · без допуска'}</p></td>
          {sectors.directions.map((direction) => {
            const state = item.sectors[direction.key] ?? { artist: null, album: null };
            return <td key={direction.key} className="p-2"><label className="inline-flex items-center gap-1"><input form={`album-${item.id}`} type="checkbox" name="on" value={direction.key} defaultChecked={sectorChecked(state)} />{sectorInherited(state) ? <span className="text-xs text-neutral-500">как у артиста</span> : null}</label></td>;
          })}
          <td className="p-2"><form id={`album-${item.id}`} action={saveAlbumSectors} className="flex flex-wrap gap-2">
            <input type="hidden" name="albumId" value={item.id} /><input type="hidden" name="status" value={status} /><input type="hidden" name="artist" value={artist} />
            <input type="hidden" name="album" value={album} /><input type="hidden" name="space" value={space} /><input type="hidden" name="page" value={page} />
            <button type="submit" className="underline">Сохранить</button>
            <button type="submit" name="reset" value="1" className="underline">как у артиста</button>
          </form></td>
        </tr>)}</tbody></table></div>
      {!sectors.albums.length && <p>Нет альбомов для секторов.</p>}
    </div>
    <ReviewQueue key={`${status}:${artist}:${album}:${space}`} rows={queue.rows} scope={{
      status, artist, album, space, total: queue.total,
      albumTotal: queue.albumTotal, artistTotal: queue.artistTotal,
    }} />
    <nav className="flex gap-4" aria-label="Страницы очереди">
      {page > 0 && <Link href={href(page - 1)}>Назад</Link>}
      <span>Страница {page + 1} · Треков: {queue.total}</span>
      {(page + 1) * 100 < queue.total && <Link href={href(page + 1)}>Далее</Link>}
      {page > 0 && <Link href={href(0, true)}>К первому непроверенному</Link>}
    </nav>
  </section>;
}
