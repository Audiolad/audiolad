import { NextResponse } from "next/server";

import { getPublishedClassicaAudioPath } from "@/lib/classica/public/load";
import { classicaPublicStorageUrl } from "@/lib/classica/public/paths";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ publicId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { publicId } = await context.params;
  const supabase = await createClient();
  const path = await getPublishedClassicaAudioPath(supabase, publicId);
  const url = classicaPublicStorageUrl(path, process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!url) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.redirect(url, 302);
}
