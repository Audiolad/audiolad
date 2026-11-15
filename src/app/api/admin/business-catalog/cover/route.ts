import { NextResponse } from 'next/server';
import { requireAdminPanelAccess } from '@/lib/admin/guard';
import { isBusinessPrivateCoverRef } from '@/lib/business-covers/private-cover';
import { signBusinessPrivateCover } from '@/lib/business-covers/private-cover.server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin preview of a closed album's private cover. Session is the admin panel.
 * Redirects to a short-lived signed URL. Public covers are not proxied here.
 */
export async function GET(request: Request) {
  await requireAdminPanelAccess();
  const albumId = new URL(request.url).searchParams.get('album') ?? '';
  if (!UUID.test(albumId)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  }
  const db = createServiceRoleClient();
  const { data, error } = await db.from('practices').select('id, cover_url').eq('id', albumId).maybeSingle();
  const coverRef = (data as { cover_url?: string | null } | null)?.cover_url ?? null;
  if (error || !isBusinessPrivateCoverRef(coverRef)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  }
  const signed = await signBusinessPrivateCover(db, coverRef, { practiceId: albumId });
  if (!signed) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.redirect(signed, { status: 302, headers: NO_STORE });
}
