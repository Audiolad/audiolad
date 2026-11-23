import { unstable_rethrow } from 'next/navigation';
import { NextResponse } from 'next/server';
import { isSameOriginJsonRequest } from '@/lib/business-app/spa-player-report';
import { createClosedBusinessAlbum } from '@/lib/business-track-passports/admin.server';
import { closedAlbumEditHref } from '@/lib/business-track-passports/create-album';
import { parseHasVocalsFlag } from '@/lib/business-catalog/vocals';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * t1504u: create a closed («только Бизнес») album. A stable URL instead of a server action, so a
 * tab opened before a deploy still works. Admin + author access are checked in
 * createClosedBusinessAlbum (admin panel guard, author membership, SECURITY DEFINER RPC).
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
  const hasVocals = parseHasVocalsFlag(body.has_vocals);
  try {
    const { id, reused } = await createClosedBusinessAlbum(authorId, title, hasVocals);
    return NextResponse.json({ ok: true, albumId: id, reused, editHref: closedAlbumEditHref(id) }, { status: reused ? 200 : 201, headers: NO_STORE });
  } catch (error) {
    // redirect()/notFound() from the admin guard keep their Next.js behaviour.
    unstable_rethrow(error);
    const message = error instanceof Error && /[А-Яа-яЁё]/.test(error.message) ? error.message : 'Не удалось создать альбом. Обновите страницу и попробуйте ещё раз.';
    console.error('admin_create_closed_album_failed', { authorId, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ ok: false, message }, { status: 400, headers: NO_STORE });
  }
}
