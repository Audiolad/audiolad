import Link from 'next/link';
import { loadClosedBusinessCatalog } from '@/lib/business-track-passports/admin.server';
import { BUSINESS_ONLY_BADGE } from '@/lib/business-track-passports/model';
import { loadPublishedBusinessCatalog } from '@/lib/business-admission/published-catalog.server';
import { CreateClosedAlbum } from './PassportForm';
import ClosedCatalogOnlySettings from './ClosedCatalogOnlySettings';
import { visibleClosedCatalogOnlySettingsAuthors } from '@/lib/authors/closed-catalog-only';
import ClosedAlbumWork from './ClosedAlbumWork';
import PublishedBusinessCatalog from './PublishedBusinessCatalog';
export const dynamic = 'force-dynamic';

const linkCardClassName =
  'rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-4 text-left transition hover:border-[#9a74d8] hover:bg-[#f8f4ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]';

export default async function ClosedBusinessCatalogPage() {
  const { authors, albums, catalogLicenseRef, catalogDefaults } = await loadClosedBusinessCatalog();
  const published = await loadPublishedBusinessCatalog();
  return <section className="space-y-6">
    <div>
      <h1 className="text-[21px] font-semibold text-[#25135c]">Закрытый каталог Бизнеса</h1>
      <p className="mt-3 inline-flex max-w-full rounded-full border border-[#eadff8] bg-[#faf6ff] px-3 py-1 text-sm font-medium text-[#5f5484]">{BUSINESS_ONLY_BADGE}</p>
      <p className="mt-3 max-w-[760px] text-sm leading-6 text-[#5f5484]">Человек вручную создаёт, выбирает и мастерит музыку. Администратор загружает мастер и заполняет паспорт. Допуск не публикует альбом автоматически. Права, направления для заведений и качество звука проверяются отдельно.</p>
    </div>
    <Link href="/admin/business-catalog/collections" className={linkCardClassName}>Персональные подборки Кофейни</Link>
    <CreateClosedAlbum authors={authors} />
    <ClosedCatalogOnlySettings authors={visibleClosedCatalogOnlySettingsAuthors(authors)} />
    <ClosedAlbumWork albums={albums} catalogLicenseRef={catalogLicenseRef} catalogDefaults={catalogDefaults} />
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
    <PublishedBusinessCatalog closed={published.closed} open={published.open} />
  </section>;
}
