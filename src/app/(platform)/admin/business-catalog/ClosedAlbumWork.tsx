import Link from 'next/link';
import {
  publishedBusinessCoverUrl,
  publishedBusinessEditHref,
  ruTrackCountLabel,
} from '@/lib/business-admission/published-catalog';
import type { Passport } from '@/lib/business-track-passports/model';
import type { CatalogPassportDefaults } from '@/lib/business-track-passports/shared';
import { DEFAULT_CATALOG_PASSPORT_DEFAULTS } from '@/lib/business-track-passports/shared';
import PassportForm from './PassportForm';
import AlbumPassportTools, { CatalogSettingsPanel } from './AlbumPassportTools';
import ShazamAutoStatus, { ShazamAutoBadge } from './ShazamAutoStatus';
import type { ShazamCheckRow, ShazamGateFacts } from '@/lib/business-track-passports/shazam';

const editLinkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] transition hover:bg-[#f8f4ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]';

type ClosedAlbum = {
  id: string;
  title: string;
  author_id: string;
  authorName?: string | null;
  status: string;
  cover_url?: string | null;
  cover_image?: unknown;
  updated_at?: string | null;
  licenseRef?: string | null;
  defaults?: CatalogPassportDefaults | null;
  tracks: { id: string; title: string; music_track_code?: string | null; passport?: Passport; shazamCheck?: ShazamCheckRow | null; shazamFinalCheck?: ShazamCheckRow | null; shazamGate?: ShazamGateFacts }[];
};

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

function AlbumCard({ album, catalogLicenseRef, catalogDefaults }: { album: ClosedAlbum; catalogLicenseRef: string | null; catalogDefaults: CatalogPassportDefaults }) {
  const approved = album.tracks.filter((track) => track.passport?.status === 'approved').length;
  const coverUrl = publishedBusinessCoverUrl({
    id: album.id,
    coverUrl: album.cover_url ?? null,
    coverImage: album.cover_image,
    updatedAt: album.updated_at,
  });
  return (
    <article className="flex flex-col gap-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
      <div className="flex gap-4">
        {coverUrl ? (
          // Private covers go through the admin signed-URL route; public covers stay public.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            width={80}
            height={80}
            className="h-20 w-20 shrink-0 rounded-[16px] object-cover"
          />
        ) : (
          <div className="h-20 w-20 shrink-0 rounded-[16px] bg-[#f4eefe]" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-[18px] font-semibold text-[#25135c]">{album.title}</h3>
            <span className={albumStatusClassName(album.status)}>{albumStatusLabel(album.status)}</span>
          </div>
          {album.authorName ? (
            <p className="mt-1 text-sm text-[#7d70a2]">{album.authorName}</p>
          ) : null}
          <p className="mt-2 text-sm text-[#5f5484]">
            {ruTrackCountLabel(album.tracks.length)}
            {album.tracks.length > 0
              ? ` – ${approved} из ${album.tracks.length} с допущенным паспортом`
              : null}
          </p>
        </div>
      </div>
      <div>
        <Link href={publishedBusinessEditHref(album.id, true)} className={editLinkClassName}>Открыть альбом</Link>
      </div>
      {album.tracks.length > 0 ? (
        <AlbumPassportTools
          albumId={album.id}
          tracks={album.tracks}
          licenseRef={album.licenseRef ?? null}
          catalogLicenseRef={catalogLicenseRef}
          catalogDefaults={catalogDefaults}
          albumDefaults={album.defaults ?? null}
        />
      ) : null}
      {album.tracks.length > 0 ? (
        <details className="rounded-[18px] border border-[#e4d7f4] bg-[#fbf8ff] p-3">
          <summary className="cursor-pointer text-sm font-medium text-[#25135c]">Треки</summary>
          <div className="mt-3 space-y-3">
            {album.tracks.map((track) => (
              <details key={track.id} className="rounded-[18px] border border-[#e4d7f4] bg-white p-3">
                <summary className="cursor-pointer text-sm font-medium text-[#25135c]">
                  <span>{track.title}</span>{' '}
                  <span className={trackStatusClassName(track.passport?.status)}>{trackStatusLabel(track.passport?.status)}</span>{' '}
                  <ShazamAutoBadge check={track.shazamCheck} finalCheck={track.shazamFinalCheck} gate={track.shazamGate} passport={track.passport} />
                </summary>
                <div className="mt-3">
                  <ShazamAutoStatus check={track.shazamCheck} finalCheck={track.shazamFinalCheck} gate={track.shazamGate} passport={track.passport} />
                </div>
                <PassportForm
                  key={`${track.id}:${JSON.stringify(track.passport)}`}
                  audioItemId={track.id}
                  passport={track.passport}
                  suggestedAlCode={track.music_track_code}
                />
              </details>
            ))}
          </div>
        </details>
      ) : (
        <p className="text-sm leading-6 text-[#7d70a2]">Сначала загрузите треки через форму музыкального альбома.</p>
      )}
    </article>
  );
}

export default function ClosedAlbumWork({ albums, catalogLicenseRef = null, catalogDefaults = DEFAULT_CATALOG_PASSPORT_DEFAULTS }: { albums: ClosedAlbum[]; catalogLicenseRef?: string | null; catalogDefaults?: CatalogPassportDefaults }) {
  return (
    <section className="space-y-4" data-closed-album-work="">
      <div>
        <h2 className="text-[20px] font-semibold text-[#25135c]">Работа с закрытыми альбомами</h2>
        <p className="mt-2 max-w-[760px] text-sm leading-6 text-[#5f5484]">
          Музыка может быть уже загружена, но в каталог Бизнеса альбом попадает только после допуска паспорта каждого трека. Метка «черновик» у трека означает, что паспорт ещё не заполнен или не допущен, а не то, что файл не загружен. Инструмент и тариф задаются один раз в настройках каталога, дата берётся из файла мастера, затем кнопка «Заполнить автоматически» считает хеши и AcoustID. Shazam проверяет каждый трек в фоне и сам записывает «совпадений нет». Если Shazam что-то найдёт, это видно у трека, и результат указывается вручную. Затем нажмите «Допустить в Бизнес» – допуск всегда вручную.
        </p>
      </div>
      <CatalogSettingsPanel catalogLicenseRef={catalogLicenseRef} catalogDefaults={catalogDefaults} albums={albums} />
      {albums.length === 0 ? (
        <p className="rounded-[18px] border border-[#eadff8] bg-white px-4 py-3 text-sm leading-6 text-[#7d70a2]">
          Пока нет закрытых альбомов.
        </p>
      ) : (
        <div className="grid gap-4">{albums.map((album) => <AlbumCard key={album.id} album={album} catalogLicenseRef={catalogLicenseRef} catalogDefaults={catalogDefaults} />)}</div>
      )}
    </section>
  );
}
