import "server-only";

import { readMaxAuthenticatedPost } from "@/lib/max/authenticated-post";
import {
  createMaxLibraryClient,
  loadMaxStage1Library,
} from "@/lib/max/library";

export const dynamic = "force-dynamic";
export { setResolveMaxNativeUserForTests } from "@/lib/max/session-binding";
export { setMaxLibraryDepsForTests } from "@/lib/max/library";

function fail(reason: string, status: number) {
  return Response.json(
    { ok: false, reason },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const authenticated = await readMaxAuthenticatedPost(request, []);
    if (!authenticated.ok) return authenticated.response;

    const loaded = await loadMaxStage1Library(
      createMaxLibraryClient(),
      authenticated.userId,
    );
    if (loaded.error) return fail("storage_unavailable", 503);

    return Response.json(
      { ok: true, items: loaded.items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return fail("storage_unavailable", 503);
  }
}
