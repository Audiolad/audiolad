import 'server-only';
import { listAuthorWorkspacesForUser, requireAuthenticatedUser } from '@/lib/author-products/auth';
import { isClosedCatalogOnlyAuthor } from '@/lib/authors/closed-catalog-only';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import {
  CLOSED_ALBUM_DUPLICATE_WINDOW_MS,
  closedBusinessAlbumInsertRow,
  findRecentClosedAlbumDuplicate,
  type RecentClosedAlbumRow,
} from '@/lib/business-track-passports/create-album';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Create (or reuse) a closed album from the author cabinet of a flagged author.
 * Access: membership of that author + closed_catalog_only. No extra support-role
 * restriction; the owner (and an editor of this workspace) can do this.
 * Auto-Shazam already enqueues on business_only music when the master is verified,
 * so the cabinet path gets the same check as an album created from /admin/business-catalog.
 */
export async function createClosedBusinessAlbumFromCabinet(
  authorId: string,
  title: string,
  hasVocals = false,
): Promise<{ id: string; reused: boolean }> {
  const { user } = await requireAuthenticatedUser();
  if (!UUID.test(authorId)) throw new Error('Некорректный идентификатор.');
  const authors = await listAuthorWorkspacesForUser(user.id);
  const author = authors.find((item) => item.id === authorId);
  if (!author) throw new Error('Нет доступа к автору для загрузки музыки.');
  if (!isClosedCatalogOnlyAuthor(author.closedCatalogOnly)) {
    throw new Error('Для этого автора закрытые альбомы из кабинета не включены.');
  }
  if (!title.trim() || title.length > 300) throw new Error('Введите название до 300 символов.');
  const service = createServiceRoleClient();
  const since = new Date(Date.now() - CLOSED_ALBUM_DUPLICATE_WINDOW_MS).toISOString();
  const recent = await service.from('practices').select('id,title,created_at')
    .eq('author_id', authorId).eq('business_only', true).is('deleted_at', null)
    .gte('created_at', since).order('created_at', { ascending: false }).limit(50);
  if (recent.error) throw new Error('Не удалось создать альбом. Обновите страницу и попробуйте ещё раз.');
  const existing = findRecentClosedAlbumDuplicate((recent.data ?? []) as RecentClosedAlbumRow[], title);
  if (existing) return { id: existing, reused: true };
  const id = crypto.randomUUID();
  const { error } = await service.from('practices').insert(closedBusinessAlbumInsertRow(authorId, title.trim(), id, hasVocals === true));
  if (error) {
    console.error('cabinet_create_closed_album_failed', { authorId, message: error.message });
    throw new Error('Не удалось создать альбом. Обновите страницу и попробуйте ещё раз.');
  }
  return { id, reused: false };
}
