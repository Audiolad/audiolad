import "server-only";

import { readMaxVerifiedPost } from "@/lib/max/authenticated-post";
import { loadMaxPlaylistCatalog } from "@/lib/max/playlists";
import { parsePlaylistListingQuery } from "@/lib/playlists/listing";

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

function optionalString(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (value == null) {
    return { ok: true, value: null };
  }

  if (typeof value !== "string") {
    return { ok: false };
  }

  return { ok: true, value };
}

function optionalLimit(
  value: unknown,
): { ok: true; value: string | number | null } | { ok: false } {
  if (value == null) {
    return { ok: true, value: null };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return { ok: true, value };
  }

  if (typeof value === "string") {
    return { ok: true, value };
  }

  return { ok: false };
}

export async function POST(request: Request) {
  try {
    const verified = await readMaxVerifiedPost(request, []);
    if (!verified.ok) {
      return verified.response;
    }

    const q = optionalString(verified.body.q);
    const topic = optionalString(verified.body.topic);
    const access = optionalString(verified.body.access);
    const sort = optionalString(verified.body.sort);
    const cursor = optionalString(verified.body.cursor);
    const limit = optionalLimit(verified.body.limit);

    if (!q.ok || !topic.ok || !access.ok || !sort.ok || !cursor.ok || !limit.ok) {
      return fail("invalid_request", 400);
    }

    const query = parsePlaylistListingQuery({
      q: q.value,
      topic: topic.value,
      access: access.value,
      sort: sort.value,
      cursor: cursor.value,
      limit: limit.value,
    });
    const catalog = await loadMaxPlaylistCatalog({
      query,
      userId: verified.userId,
    });

    if (!catalog.ok) {
      return fail("storage_unavailable", 503);
    }

    return Response.json(
      {
        ok: true,
        items: catalog.items,
        nextCursor: catalog.nextCursor,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return fail("storage_unavailable", 503);
  }
}
