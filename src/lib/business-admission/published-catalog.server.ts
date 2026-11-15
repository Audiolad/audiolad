import 'server-only';
import { requireAdminPanelAccess } from '@/lib/admin/guard';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import {
  buildPublishedBusinessCatalog,
  type PublishedBusinessAlbumView,
  type PublishedBusinessDirection,
  type PublishedCatalogAdmissionRow,
  type PublishedCatalogAlbumRow,
  type PublishedCatalogTrackRow,
} from '@/lib/business-admission/published-catalog';

async function everyRow(load: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await load(from, from + 999);
    if (error) throw new Error('Не удалось загрузить опубликованный каталог Бизнеса.');
    const page = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

export type PublishedBusinessCatalog = {
  closed: PublishedBusinessAlbumView[];
  open: PublishedBusinessAlbumView[];
  directions: PublishedBusinessDirection[];
};

export async function loadPublishedBusinessCatalog(): Promise<PublishedBusinessCatalog> {
  await requireAdminPanelAccess();
  const db = createServiceRoleClient();
  const { data: directionRows, error: directionError } = await db
    .from('business_content_directions')
    .select('key, name, sort_order, active')
    .eq('active', true);
  if (directionError) throw new Error('Не удалось загрузить направления для залов.');
  const directions = ((directionRows ?? []) as { key: string; name: string; sort_order?: number }[])
    .slice()
    .sort((left, right) => (left.sort_order ?? 100) - (right.sort_order ?? 100) || (left.key < right.key ? -1 : 1))
    .map((row) => ({ key: row.key, name: row.name }));

  const practiceRows = await everyRow((from, to) => db
    .from('practices')
    .select('id, title, author_id, status, product_kind, catalog_visibility, business_only, deleted_at, cover_url, cover_image, updated_at')
    .eq('product_kind', 'music')
    .eq('status', 'published')
    .is('deleted_at', null)
    .range(from, to));

  const authorIds = [...new Set(practiceRows.map((row) => String(row.author_id ?? '')).filter(Boolean))];
  const names = new Map<string, string>();
  for (let index = 0; index < authorIds.length; index += 100) {
    const { data, error } = await db.from('authors').select('id, name').in('id', authorIds.slice(index, index + 100));
    if (error) throw new Error('Не удалось загрузить авторов.');
    for (const row of (data ?? []) as { id: string; name: string | null }[]) names.set(row.id, row.name?.trim() ?? '');
  }

  const albums: PublishedCatalogAlbumRow[] = practiceRows.map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ''),
    authorId: String(row.author_id ?? ''),
    authorName: names.get(String(row.author_id ?? '')) ?? '',
    status: String(row.status ?? ''),
    productKind: String(row.product_kind ?? ''),
    catalogVisibility: (row.catalog_visibility as string | null) ?? null,
    businessOnly: row.business_only === true,
    deletedAt: (row.deleted_at as string | null) ?? null,
    coverUrl: (row.cover_url as string | null) ?? null,
    coverImage: row.cover_image,
    updatedAt: (row.updated_at as string | null) ?? null,
  }));

  const albumIds = albums.map((album) => album.id);
  const decisions: PublishedCatalogAdmissionRow[] = [];
  for (let index = 0; index < authorIds.length; index += 100) {
    const { data, error } = await db
      .from('business_content_admissions')
      .select('author_id, practice_id, direction_key, allowed')
      .in('author_id', authorIds.slice(index, index + 100))
      .is('practice_id', null);
    if (error) throw new Error('Не удалось загрузить допуски.');
    decisions.push(...((data ?? []) as PublishedCatalogAdmissionRow[]));
  }
  for (let index = 0; index < albumIds.length; index += 100) {
    const { data, error } = await db
      .from('business_content_admissions')
      .select('author_id, practice_id, direction_key, allowed')
      .in('practice_id', albumIds.slice(index, index + 100));
    if (error) throw new Error('Не удалось загрузить допуски.');
    decisions.push(...((data ?? []) as PublishedCatalogAdmissionRow[]));
  }

  const tracks: PublishedCatalogTrackRow[] = [];
  for (let index = 0; index < albumIds.length; index += 100) {
    const page = await everyRow((from, to) => db
      .from('audio_items')
      .select('id, practice_id, title, status, position')
      .in('practice_id', albumIds.slice(index, index + 100))
      .eq('status', 'published')
      .range(from, to));
    for (const row of page) {
      tracks.push({
        id: String(row.id),
        practiceId: String(row.practice_id ?? ''),
        title: String(row.title ?? ''),
        status: String(row.status ?? ''),
        position: typeof row.position === 'number' ? row.position : 1_000_000,
      });
    }
  }

  const closedIds = albums.filter((album) => album.businessOnly).map((album) => album.id);
  const approvedPassportTrackIds = new Set<string>();
  for (let index = 0; index < closedIds.length; index += 100) {
    const { data, error } = await db
      .from('business_track_passports')
      .select('audio_item_id')
      .in('practice_id', closedIds.slice(index, index + 100))
      .eq('status', 'approved');
    if (error) throw new Error('Не удалось загрузить паспорта.');
    for (const row of (data ?? []) as { audio_item_id: string }[]) approvedPassportTrackIds.add(row.audio_item_id);
  }

  const grouped = buildPublishedBusinessCatalog({
    albums, tracks, directions, decisions, approvedPassportTrackIds,
  });
  return { ...grouped, directions };
}
