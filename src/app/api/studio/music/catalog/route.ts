import { NextResponse } from "next/server";

import { readPriceVisitorId } from "@/lib/pricing/visitor";
import {
  createSupabaseStudioMusicCatalogStore,
  handleStudioMusicCatalog,
} from "@/lib/studio-music/catalog";
import { studioRouteError } from "@/lib/studio/server/route-errors";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "no-referrer");
  return NextResponse.json(body, { ...init, headers });
}

async function handleError(error: unknown) {
  const response = studioRouteError(error, "studio_music_catalog_route_error");
  return noStoreJson(await response.json(), { status: response.status });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const visitorId = await readPriceVisitorId();
    const result = await handleStudioMusicCatalog({
      filter: searchParams.get("filter"),
      cursor: searchParams.get("cursor"),
      limit: searchParams.get("limit"),
      userId: user?.id ?? null,
      visitorId,
      store: createSupabaseStudioMusicCatalogStore(createServiceRoleClient()),
    });
    return noStoreJson(result.body, { status: result.status });
  } catch (error) {
    return await handleError(error);
  }
}
