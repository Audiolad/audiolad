import { NextResponse } from 'next/server';
import { requireAdminPanelAccess } from '@/lib/admin/guard';
import { signBusinessPassportLicenseForScope } from '@/lib/business-track-passports/license.server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  await requireAdminPanelAccess();
  const params = new URL(request.url).searchParams;
  const scope = params.get('scope') ?? '';
  const albumId = params.get('album') ?? '';
  const target = scope === 'catalog' ? 'catalog' as const : UUID.test(albumId) ? { albumId } : null;
  if (!target) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  }
  const signed = await signBusinessPassportLicenseForScope(target);
  if (!signed) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.redirect(signed, { status: 302, headers: NO_STORE });
}
