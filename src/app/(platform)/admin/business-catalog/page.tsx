import Link from 'next/link';
import { loadClosedBusinessCatalog } from '@/lib/business-track-passports/admin.server';
import { BUSINESS_ONLY_BADGE } from '@/lib/business-track-passports/model';
import PassportForm, { CreateClosedAlbum } from './PassportForm';
export const dynamic = 'force-dynamic';

export default async function ClosedBusinessCatalogPage() {
  const { authors, albums } = await loadClosedBusinessCatalog();
  return <section className="space-y-6 p-4">
    <h1 className="text-2xl font-semibold">Закрытый каталог Бизнеса</h1>
    <p>{BUSINESS_ONLY_BADGE}</p>
    <p>Человек вручную создаёт, выбирает и мастерит музыку. Администратор загружает мастер и заполняет паспорт. Допуск не публикует альбом автоматически. Права, направления для заведений и качество звука проверяются отдельно.</p>
    <CreateClosedAlbum authors={authors} />
    <Link href="/admin/business-track-review">Проверка качества звука</Link>{' '}
    <Link href="/admin/business-admissions">Направления для залов</Link>
    {albums.map((album) => <article key={album.id} className="space-y-4 rounded border p-4">
      <h2 className="text-xl">{album.title} – {album.status === 'published' ? 'опубликован в закрытом каталоге' : 'черновик'}</h2>
      {authors.some((a) => a.id === album.author_id) && <Link className="underline" href={`/author-dashboard/products/${album.id}?step=2`}>Загрузить треки и мастер-файлы</Link>}
      {album.tracks.map((track) => <details key={track.id} className="border p-3"><summary>{track.title} – {track.passport?.status === 'approved' ? 'допущен' : track.passport?.status === 'revoked' ? 'отозван' : 'черновик'}</summary>
        <PassportForm key={`${track.id}:${JSON.stringify(track.passport)}`} audioItemId={track.id} passport={track.passport} />
      </details>)}
      {!album.tracks.length && <p>Сначала загрузите треки через форму музыкального альбома.</p>}
    </article>)}
  </section>;
}
