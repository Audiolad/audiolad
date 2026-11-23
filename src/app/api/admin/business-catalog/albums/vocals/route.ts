import { unstable_rethrow } from 'next/navigation';
import { NextResponse } from 'next/server';
import { isSameOriginJsonRequest } from '@/lib/business-app/spa-player-report';
import { parseHasVocalsFlag } from '@/lib/business-catalog/vocals';
import { setBusinessAlbumHasVocals } from '@/lib/business-track-passports/admin.server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

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
  const albumId = typeof body.album_id === 'string' ? body.album_id : '';
  const hasVocals = parseHasVocalsFlag(body.has_vocals);
  try {
    await setBusinessAlbumHasVocals(albumId, hasVocals);
    return NextResponse.json({ ok: true, albumId, hasVocals }, { headers: NO_STORE });
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error && /[А-Яа-яЁё]/.test(error.message)
      ? error.message
      : 'Не удалось изменить метку «С вокалом». Обновите страницу и попробуйте ещё раз.';
    console.error('admin_set_album_has_vocals_failed', { albumId, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ ok: false, message }, { status: 400, headers: NO_STORE });
  }
}
