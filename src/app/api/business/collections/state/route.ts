import { NextResponse } from "next/server";
import { loadPersonalCollection } from "@/lib/business-collections/load.server";
import { isCoffeeHostRequest } from "@/lib/business-app/host";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const collection = isCoffeeHostRequest(request.headers) ? await loadPersonalCollection() : null;
    return NextResponse.json(collection ? { ok: true, id: collection.id, tracks: collection.tracks.map((track) => track.audioItemId) } : { ok: false }, { headers, status: collection ? 200 : 404 });
  } catch { return NextResponse.json({ ok: false }, { headers, status: 503 }); }
}
