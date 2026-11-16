/**
 * t1504u: creating a closed («только Бизнес») album from /admin/business-catalog.
 *
 * The form used to call a server action. Server actions are addressed by build-specific IDs,
 * so a tab opened before a deploy posted an unknown ID (HTTP 409 «Failed to find Server
 * Action»), Next reloaded the page and the album was never created – silently. The form now
 * posts to the stable route POST /api/admin/business-catalog/albums and goes to the album
 * edit page on success; every failure is shown as a red message on the form.
 * Pure module: safe for client components and unit tests.
 */
export const CREATE_CLOSED_ALBUM_ROUTE = '/api/admin/business-catalog/albums';

/** A second create of the same title for the same author within this window opens the first album. */
export const CLOSED_ALBUM_DUPLICATE_WINDOW_MS = 15 * 60 * 1000;

export const CREATE_CLOSED_ALBUM_FALLBACK_ERROR = 'Не удалось создать альбом. Обновите страницу и попробуйте ещё раз.';
export const CREATE_CLOSED_ALBUM_SESSION_ERROR = 'Сессия администратора истекла. Обновите страницу, войдите снова и повторите.';

export function normalizeClosedAlbumTitle(title: string): string {
  return title.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

/** Same edit page as «Открыть альбом» / «Редактировать» for a closed album (step 2 – tracks). */
export function closedAlbumEditHref(albumId: string): string {
  return `/author-dashboard/products/${encodeURIComponent(albumId)}?step=2`;
}

export type RecentClosedAlbumRow = { id: string; title: string | null; created_at: string | null };

/** Newest album of the same author with the same title created within the window, if any. */
export function findRecentClosedAlbumDuplicate(
  rows: readonly RecentClosedAlbumRow[],
  title: string,
  now: number = Date.now(),
): string | null {
  const wanted = normalizeClosedAlbumTitle(title);
  if (!wanted) return null;
  let best: { id: string; at: number } | null = null;
  for (const row of rows) {
    if (!row?.id || typeof row.title !== 'string') continue;
    if (normalizeClosedAlbumTitle(row.title) !== wanted) continue;
    const at = row.created_at ? Date.parse(row.created_at) : Number.NaN;
    if (!Number.isFinite(at) || now - at > CLOSED_ALBUM_DUPLICATE_WINDOW_MS || at - now > 60_000) continue;
    if (!best || at > best.at) best = { id: row.id, at };
  }
  return best?.id ?? null;
}

export type CreateClosedAlbumResult =
  | { ok: true; albumId: string; editHref: string; reused: boolean }
  | { ok: false; message: string };

/** Reads the route response. Anything unexpected (HTML login page, 5xx, bad JSON) is a visible error. */
export function parseCreateClosedAlbumResponse(input: {
  status: number;
  redirected?: boolean;
  contentType?: string | null;
  body: string;
}): CreateClosedAlbumResult {
  const json = (input.contentType ?? '').toLowerCase().includes('application/json');
  if (input.redirected || !json) {
    return { ok: false, message: input.status === 401 || input.status === 403 || input.redirected ? CREATE_CLOSED_ALBUM_SESSION_ERROR : CREATE_CLOSED_ALBUM_FALLBACK_ERROR };
  }
  let payload: unknown;
  try { payload = JSON.parse(input.body); } catch { return { ok: false, message: CREATE_CLOSED_ALBUM_FALLBACK_ERROR }; }
  const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const message = typeof data.message === 'string' && data.message.trim() ? data.message.trim() : null;
  if (input.status >= 200 && input.status < 300 && data.ok === true && typeof data.albumId === 'string' && data.albumId) {
    return { ok: true, albumId: data.albumId, editHref: closedAlbumEditHref(data.albumId), reused: data.reused === true };
  }
  if (input.status === 401 || input.status === 403) return { ok: false, message: message ?? CREATE_CLOSED_ALBUM_SESSION_ERROR };
  return { ok: false, message: message ?? CREATE_CLOSED_ALBUM_FALLBACK_ERROR };
}

/** Same row the admin RPC admin_create_business_album inserts. */
export function closedBusinessAlbumInsertRow(authorId: string, title: string, albumId: string) {
  return {
    id: albumId,
    author_id: authorId,
    title,
    slug: `business-${albumId}`,
    status: 'draft',
    price: 0,
    is_free: true,
    currency: 'RUB',
    product_kind: 'music',
    publication_class: 'release',
    music_usage_permission: 'listen_only',
    format: 'Музыка',
    business_only: true,
    catalog_visibility: 'selected_users',
    is_catalog_listed: false,
  };
}
