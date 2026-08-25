import { NextResponse } from "next/server";

import { toPublicPlaylistDetailHttpResult } from "@/lib/playlists/catalog-playback";
import { loadPublicPlaylistBySlug } from "@/lib/playlists/public-detail";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const loaded = await loadPublicPlaylistBySlug(slug);
  const result = toPublicPlaylistDetailHttpResult(loaded);

  return NextResponse.json(result.body, { status: result.status });
}
