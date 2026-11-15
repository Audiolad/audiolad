import Link from 'next/link';
import { loadClosedBusinessCatalog } from '@/lib/business-track-passports/admin.server';
import { BUSINESS_ONLY_BADGE } from '@/lib/business-track-passports/model';
import PassportForm, { CreateClosedAlbum } from './PassportForm';
export const dynamic = 'force-dynamic';

const linkCardClassName =
  'rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-4 text-left transition hover:border-[#9a74d8] hover:bg-[#f8f4ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]';

function albumStatusLabel(status: string) {
  return status === 'published' ? 'опубликован в закрытом каталоге' : 'черновик';
}

function albumStatusClassName(status: string) {
  return status === 'published'
    ? 'rounded-full bg-[#e8f6ee] px-3 py-1 text-xs font-semibold text-[#1f7a46]'
    : 'rounded-full bg-[#f4eefe] px-3 py-1 text-xs font-semibold text-[#7042c5]';
}

function trackStatusLabel(status: string | undefined) {
  return status === 'approved' ? 'допущен' : status === 'revoked' ? 'отозван' : 'черновик';
}

function trackStatusClassName(status: string | undefined) {
  if (status === 'approved') return 'rounded-full bg-[#e8f6ee] px-2.5 py-0.5 text-xs font-semibold text-[#1f7a46]';
  if (status === 'revoked') return 'rounded-full bg-[#fff1f2] px-2.5 py-0.5 text-xs font-semibold text-[#9b3d3d]';
  return 'rounded-full bg-[#f4eefe] px-2.5 py-0.5 text-xs font-semibold text-[#7042c5]';
}

export default async function ClosedBusinessCatalogPage() {
  const { authors, albums } = await loadClosedBusinessCatalog();
  return <section className="space-y-6">
    <div>
      <h1 className="text-[21px] font-semibold text-[#25135c]">Закрытый каталог Бизнеса</h1>
      <p className="mt-3 inline-flex max-w-full rounded-full border border-[#eadff8] bg-[#faf6ff] px-3 py-1 text-sm font-medium text-[#5f5484]">{BUSINESS_ONLY_BADGE}</p>
      <p className="mt-3 max-w-[760px] text-sm leading-6 text-[#5f5484]">Человек вручную создаёт, выбирает и мастерит музыку. Администратор загружает мастер и заполняет паспорт. Допуск не публикует альбом автоматически. Права, направления для заведений и качество звука проверяются отдельно.</p>
    </div>
    <CreateClosedAlbum authors={authors} />
    <div className="grid gap-3 sm:grid-cols-2">
      <Link href="/admin/business-track-review" className={linkCardClassName}>
        <span className="block text-sm font-medium text-[#3f3560]">Проверка качества звука</span>
        <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">Решение о качестве звука треков закрытого каталога.</span>
      </Link>
      <Link href="/admin/business-admissions" className={linkCardClassName}>
        <span className="block text-sm font-medium text-[#3f3560]">Направления для залов</span>
        <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">Допуск альбомов и авторов к направлениям заведений.</span>
      </Link>
    </div>
    {albums.map((album) => <article key={album.id} className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[18px] font-semibold text-[#25135c]">{album.title}</h2>
        <span className={albumStatusClassName(album.status)}>{albumStatusLabel(album.status)}</span>
      </div>
      {authors.some((a) => a.id === album.author_id) && (
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] transition hover:bg-[#f8f4ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          href={`/author-dashboard/products/${album.id}?step=2`}
        >
          Загрузить треки и мастер-файлы
        </Link>
      )}
      {album.tracks.map((track) => <details key={track.id} className="rounded-[18px] border border-[#e4d7f4] bg-[#fbf8ff] p-3">
        <summary className="cursor-pointer text-sm font-medium text-[#25135c]">
          <span>{track.title}</span>{' '}
          <span className={trackStatusClassName(track.passport?.status)}>{trackStatusLabel(track.passport?.status)}</span>
        </summary>
        <PassportForm key={`${track.id}:${JSON.stringify(track.passport)}`} audioItemId={track.id} passport={track.passport} />
      </details>)}
      {!album.tracks.length && <p className="text-sm leading-6 text-[#7d70a2]">Сначала загрузите треки через форму музыкального альбома.</p>}
    </article>)}
  </section>;
}
