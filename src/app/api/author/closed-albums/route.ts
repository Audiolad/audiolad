import { NextResponse } from 'next/server';
import { isSameOriginJsonRequest } from '@/lib/business-app/spa-player-report';
import { createClosedBusinessAlbumFromCabinet } from '@/lib/business-track-passports/cabinet.server';
import { closedAlbumEditHref } from '@/lib/business-track-passports/create-album';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * t1505u: create a closed album from the author cabinet of a flagged author.
 * Stable URL, not a server action – a tab opened before a deploy still works.
 */
export async function POST(request: Request) {
  if (!isSameOriginJsonRequest(request.headers)) {
    return NextResponse.json({ ok: false, message: 'Запрос отклонён. Обновите страницу и попробуйте ещё раз.' }, { status: 403, headers: NO_STORE });
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ ok: false, message: 'Некорректный запрос.' }, { status: 400, headers: NO_STORE });
  }
  const authorId = typeof body.author_id === 'string' ? body.author_id : '';
  const title = typeof body.title === 'string' ? body.title : '';
  try {
    const { id, reused } = await createClosedBusinessAlbumFromCabinet(authorId, title);
    return NextResponse.json({ ok: true, albumId: id, reused, editHref: closedAlbumEditHref(id) }, { status: reused ? 200 : 201, headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error && /[А-Яа-яЁё]/.test(error.message)
      ? error.message
      : 'Не удалось создать альбом. Обновите страницу и попробуйте ещё раз.';
    const denied = message.includes('не включены') || message.includes('Нет доступа');
    console.error('cabinet_create_closed_album_route_failed', { authorId, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ ok: false, message }, { status: denied ? 403 : 400, headers: NO_STORE });
  }
}
