import "server-only";

import { readMaxVerifiedPost } from "@/lib/max/authenticated-post";
import { loadMaxPlaylistDetail } from "@/lib/max/playlists";

export const dynamic = "force-dynamic";

export {
  setListMaxPublicPlaylistsForTests,
  setLoadMaxPublicPlaylistForTests,
} from "@/lib/max/playlists";
export { setResolveMaxNativeUserForTests } from "@/lib/max/session-binding";

function fail(reason: string, status: number) {
  return Response.json(
    { ok: false, reason },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const verified = await readMaxVerifiedPost(request, ["slug"]);
    if (!verified.ok) {
      return verified.response;
    }

    const slug = String(verified.body.slug).trim();
    const loaded = await loadMaxPlaylistDetail(slug);

    if (!loaded.ok) {
      if (loaded.reason === "not_found") {
        return fail("not_found", 404);
      }

      return fail("storage_unavailable", 503);
    }

    return Response.json(
      { ok: true, detail: loaded.detail },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return fail("storage_unavailable", 503);
  }
}
