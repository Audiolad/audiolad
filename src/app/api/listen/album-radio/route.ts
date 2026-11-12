import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { selectAlbumRadio } from "@/lib/listen/album-radio.server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body?.author !== "string" || typeof body?.slug !== "string" ||
        body.author.length > 150 || body.slug.length > 200 || !Array.isArray(body.exclude) ||
        body.exclude.length > 512 || body.exclude.some((id: unknown) => typeof id !== "string" || id.length > 80)) {
      return NextResponse.json({ ok: false }, { status: 400, headers });
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const result = await selectAlbumRadio({ supabase, userId: user?.id ?? null,
      author: body.author, slug: body.slug, exclude: body.exclude, enabled: body.enabled !== false });
    return NextResponse.json({ ok: true, ...result, entries: result?.entries ?? [] }, { headers });
  } catch {
    return NextResponse.json({ ok: false, entries: [] }, { status: 503, headers });
  }
}
