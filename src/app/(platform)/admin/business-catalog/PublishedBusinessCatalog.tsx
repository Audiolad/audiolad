import Link from 'next/link';
import {
  PUBLISHED_BUSINESS_GROUP_LABELS,
  ruTrackCountLabel,
  type PublishedBusinessAlbumView,
  type PublishedBusinessGroup,
} from '@/lib/business-admission/published-catalog';

const editLinkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] transition hover:bg-[#f8f4ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]';

function AlbumCard({ album }: { album: PublishedBusinessAlbumView }) {
  return (
    <article className="flex flex-col gap-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
      <div className="flex gap-4">
        {album.coverUrl ? (
          // Private covers go through the admin signed-URL route; public covers stay public.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={album.coverUrl}
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
            <span className="rounded-full bg-[#e8f6ee] px-3 py-1 text-xs font-semibold text-[#1f7a46]">{album.statusLabel}</span>
          </div>
          {album.authorName ? (
            <p className="mt-1 text-sm text-[#7d70a2]">{album.authorName}</p>
          ) : null}
          <p className="mt-2 text-sm text-[#5f5484]">
            {ruTrackCountLabel(album.trackCount)}
            {album.group === 'closed' && album.approvedPassportCount > 0
              ? ` – ${album.approvedPassportCount} с допущенным паспортом`
              : null}
          </p>
        </div>
      </div>
      {album.directions.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {album.directions.map((direction) => (
            <li key={direction.key} className="rounded-full bg-[#f4eefe] px-3 py-1 text-xs font-medium text-[#7042c5]">
              {direction.name}
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <Link href={album.editHref} className={editLinkClassName}>Открыть альбом</Link>
      </div>
      {album.tracks.length > 0 ? (
        <details className="rounded-[18px] border border-[#e4d7f4] bg-[#fbf8ff] p-3">
          <summary className="cursor-pointer text-sm font-medium text-[#25135c]">Треки</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[#5f5484]">
            {album.tracks.map((track) => (
              <li key={track.id}>{track.title}</li>
            ))}
          </ol>
        </details>
      ) : null}
    </article>
  );
}

function Group({
  group,
  albums,
}: {
  group: PublishedBusinessGroup;
  albums: PublishedBusinessAlbumView[];
}) {
  return (
    <section className="space-y-4" data-published-group={group}>
      <h3 className="text-[18px] font-semibold text-[#25135c]">
        {PUBLISHED_BUSINESS_GROUP_LABELS[group]}
        <span className="ml-2 text-sm font-medium text-[#7d70a2]">– {albums.length}</span>
      </h3>
      {albums.length === 0 ? (
        <p className="rounded-[18px] border border-[#eadff8] bg-white px-4 py-3 text-sm leading-6 text-[#7d70a2]">
          {group === 'closed'
            ? 'Пока нет закрытых альбомов, опубликованных в Бизнесе.'
            : 'Пока нет альбомов из открытого АудиоЛада, допущенных в Бизнес.'}
        </p>
      ) : (
        <div className="grid gap-4">{albums.map((album) => <AlbumCard key={album.id} album={album} />)}</div>
      )}
    </section>
  );
}

export default function PublishedBusinessCatalog({
  closed,
  open,
}: {
  closed: PublishedBusinessAlbumView[];
  open: PublishedBusinessAlbumView[];
}) {
  const total = closed.length + open.length;
  return (
    <section className="space-y-5" data-published-business-catalog="">
      <div>
        <h2 className="text-[20px] font-semibold text-[#25135c]">Опубликовано в АудиоЛад Бизнес</h2>
        <p className="mt-2 max-w-[760px] text-sm leading-6 text-[#5f5484]">
          Альбомы, которые сейчас допущены в АудиоЛад Бизнес: закрытые альбомы с паспортом и альбомы из открытого АудиоЛада, у которых есть направление для залов. Право на воспроизведение в конкретном зале проверяется отдельно.
        </p>
        <p className="mt-2 text-sm text-[#7d70a2]">Всего – {total}</p>
      </div>
      <Group group="closed" albums={closed} />
      <Group group="open" albums={open} />
    </section>
  );
}
