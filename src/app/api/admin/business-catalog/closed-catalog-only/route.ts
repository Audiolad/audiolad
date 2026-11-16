import { unstable_rethrow } from 'next/navigation';
import { NextResponse } from 'next/server';
import { requireAdminPanelAccess } from '@/lib/admin/guard';
import { isSameOriginJsonRequest } from '@/lib/business-app/spa-player-report';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * t1505u: operator toggle for authors.closed_catalog_only.
 * Uses a stable route (not a server action). Owner with admin panel access can change it.
 */
export async function POST(request: Request) {
  if (!isSameOriginJsonRequest(request.headers)) {
    return NextResponse.json({ ok: false, message: 'Запрос отклонён. Обновите страницу и попробуйте ещё раз.' }, { status: 403, headers: NO_STORE });
  }
  try {
    await requireAdminPanelAccess();
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json({ ok: false, message: 'Нужен доступ администратора.' }, { status: 403, headers: NO_STORE });
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ ok: false, message: 'Некорректный запрос.' }, { status: 400, headers: NO_STORE });
  }
  const authorId = typeof body.author_id === 'string' ? body.author_id : '';
  if (!UUID.test(authorId)) {
    return NextResponse.json({ ok: false, message: 'Некорректный идентификатор.' }, { status: 400, headers: NO_STORE });
  }
  const enabled = body.enabled === true;
  const db = createServiceRoleClient();
  const { data, error } = await db.from('authors').update({ closed_catalog_only: enabled }).eq('id', authorId).select('id').maybeSingle();
  if (error || !data?.id) {
    console.error('admin_closed_catalog_only_update_failed', { authorId, message: error?.message ?? 'missing' });
    return NextResponse.json({ ok: false, message: 'Не удалось сохранить настройку. Обновите страницу и попробуйте ещё раз.' }, { status: 400, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, authorId, enabled }, { status: 200, headers: NO_STORE });
}
