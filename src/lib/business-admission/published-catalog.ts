import { cabinetAlbumCoverUrl } from '@/lib/business-app/album-cover';
import { isBusinessPrivateCoverRef } from '@/lib/business-covers/private-cover';
import { resolveManualAdmission } from '@/lib/business-admission/policy';

export const PUBLISHED_BUSINESS_GROUP_LABELS = {
  closed: 'Только для Бизнеса',
  open: 'Из открытого АудиоЛада',
} as const;

export type PublishedBusinessGroup = keyof typeof PUBLISHED_BUSINESS_GROUP_LABELS;

export type PublishedBusinessDirection = { key: string; name: string };

export type PublishedBusinessTrack = { id: string; title: string };

export type PublishedBusinessAlbumView = {
  id: string;
  title: string;
  authorName: string;
  group: PublishedBusinessGroup;
  statusLabel: string;
  trackCount: number;
  approvedPassportCount: number;
  directions: PublishedBusinessDirection[];
  tracks: PublishedBusinessTrack[];
  coverUrl: string | null;
  editHref: string;
};

export type PublishedCatalogAlbumRow = {
  id: string;
  title: string;
  authorId: string;
  authorName: string;
  status: string;
  productKind: string;
  catalogVisibility: string | null;
  businessOnly: boolean;
  deletedAt: string | null;
  coverUrl: string | null;
  coverImage?: unknown;
  updatedAt?: string | null;
};

export type PublishedCatalogTrackRow = {
  id: string;
  practiceId: string;
  title: string;
  status: string;
  position: number;
};

export type PublishedCatalogAdmissionRow = {
  author_id: string | null;
  practice_id: string | null;
  direction_key: string;
  allowed: boolean | null;
};

export const PUBLISHED_IN_BUSINESS_STATUS_LABEL = 'опубликован в Бизнесе';

export const ADMIN_BUSINESS_CATALOG_COVER_PATH = '/api/admin/business-catalog/cover';

export function publishedBusinessEditHref(albumId: string, businessOnly: boolean): string {
  return businessOnly
    ? `/author-dashboard/products/${albumId}?step=2`
    : `/author-dashboard/products/${albumId}`;
}

export function publishedBusinessCoverUrl(album: {
  id: string;
  coverUrl: string | null;
  coverImage?: unknown;
  updatedAt?: string | null;
}): string | null {
  if (isBusinessPrivateCoverRef(album.coverUrl)) {
    return `${ADMIN_BUSINESS_CATALOG_COVER_PATH}?album=${encodeURIComponent(album.id)}`;
  }
  return cabinetAlbumCoverUrl({
    coverUrl: album.coverUrl,
    coverImage: album.coverImage,
    updatedAt: album.updatedAt,
  });
}

export function ruTrackCountLabel(count: number): string {
  const n10 = count % 10;
  const n100 = count % 100;
  if (n10 === 1 && n100 !== 11) return `${count} трек`;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return `${count} трека`;
  return `${count} треков`;
}

export function isPublishedBusinessVisibility(
  album: Pick<PublishedCatalogAlbumRow, 'status' | 'productKind' | 'catalogVisibility' | 'businessOnly' | 'deletedAt'>,
  approvedPassportCount: number,
): boolean {
  if (album.deletedAt != null) return false;
  if (album.status !== 'published' || album.productKind !== 'music') return false;
  if (album.businessOnly) return approvedPassportCount > 0;
  return album.catalogVisibility === 'listed';
}

export function directionsForPublishedAlbum(
  album: Pick<PublishedCatalogAlbumRow, 'id' | 'authorId'>,
  directions: readonly PublishedBusinessDirection[],
  decisions: readonly PublishedCatalogAdmissionRow[],
): PublishedBusinessDirection[] {
  return directions.filter((direction) => {
    const artist = decisions.find((row) => row.author_id === album.authorId && !row.practice_id && row.direction_key === direction.key);
    const own = decisions.find((row) => row.practice_id === album.id && row.direction_key === direction.key);
    return resolveManualAdmission(
      { allowed: artist?.allowed ?? null },
      { allowed: own?.allowed ?? null },
    ).allowed;
  });
}

function sortTitle(left: string, right: string, leftId: string, rightId: string): number {
  const byTitle = left.localeCompare(right, 'ru');
  if (byTitle !== 0) return byTitle;
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

/** Albums that halls can consider: published music, visible in Business, admitted to at least one active direction. */
export function buildPublishedBusinessCatalog(input: {
  albums: readonly PublishedCatalogAlbumRow[];
  tracks: readonly PublishedCatalogTrackRow[];
  directions: readonly PublishedBusinessDirection[];
  decisions: readonly PublishedCatalogAdmissionRow[];
  approvedPassportTrackIds: ReadonlySet<string>;
}): { closed: PublishedBusinessAlbumView[]; open: PublishedBusinessAlbumView[] } {
  const tracksByAlbum = new Map<string, PublishedCatalogTrackRow[]>();
  const approvedByAlbum = new Map<string, number>();
  for (const track of input.tracks) {
    if (track.status !== 'published') continue;
    const list = tracksByAlbum.get(track.practiceId) ?? [];
    list.push(track);
    tracksByAlbum.set(track.practiceId, list);
    if (input.approvedPassportTrackIds.has(track.id)) {
      approvedByAlbum.set(track.practiceId, (approvedByAlbum.get(track.practiceId) ?? 0) + 1);
    }
  }

  const closed: PublishedBusinessAlbumView[] = [];
  const open: PublishedBusinessAlbumView[] = [];
  for (const album of input.albums) {
    const approvedPassportCount = approvedByAlbum.get(album.id) ?? 0;
    if (!isPublishedBusinessVisibility(album, approvedPassportCount)) continue;
    const directions = directionsForPublishedAlbum(album, input.directions, input.decisions);
    if (directions.length === 0) continue;
    const tracks = (tracksByAlbum.get(album.id) ?? [])
      .slice()
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
      .map((track) => ({ id: track.id, title: track.title.trim() || 'Трек' }));
    const view: PublishedBusinessAlbumView = {
      id: album.id,
      title: album.title.trim() || 'Альбом',
      authorName: album.authorName.trim(),
      group: album.businessOnly ? 'closed' : 'open',
      statusLabel: PUBLISHED_IN_BUSINESS_STATUS_LABEL,
      trackCount: tracks.length,
      approvedPassportCount,
      directions,
      tracks,
      coverUrl: publishedBusinessCoverUrl(album),
      editHref: publishedBusinessEditHref(album.id, album.businessOnly),
    };
    if (view.group === 'closed') closed.push(view);
    else open.push(view);
  }
  closed.sort((left, right) => sortTitle(left.title, right.title, left.id, right.id));
  open.sort((left, right) => sortTitle(left.title, right.title, left.id, right.id));
  return { closed, open };
}
