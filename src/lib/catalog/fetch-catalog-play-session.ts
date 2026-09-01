import type { CatalogGlobalPlayerSession } from "@/lib/listen/global-player-types";

export type FetchCatalogPlaySessionResult =
  | { ok: true; session: CatalogGlobalPlayerSession }
  | { ok: false; reason: string };

export function buildCatalogPlaySessionUrl(
  authorSlug: string,
  productSlug: string,
  audioItemId?: string | null,
): string {
  const params = new URLSearchParams({
    author: authorSlug,
    slug: productSlug,
  });
  const requestedAudioItemId = audioItemId?.trim() || "";

  if (requestedAudioItemId) {
    params.set("audioItemId", requestedAudioItemId);
  }

  return `/api/catalog/play?${params.toString()}`;
}

export async function fetchCatalogPlaySession(
  authorSlug: string,
  productSlug: string,
  audioItemId?: string | null,
): Promise<FetchCatalogPlaySessionResult> {
  try {
    const response = await fetch(
      buildCatalogPlaySessionUrl(authorSlug, productSlug, audioItemId),
      {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      },
    );

    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      session?: CatalogGlobalPlayerSession;
      reason?: string;
    } | null;

    if (!response.ok || !data?.ok || !data.session) {
      return {
        ok: false,
        reason: data?.reason || "unavailable",
      };
    }

    return { ok: true, session: data.session };
  } catch {
    return { ok: false, reason: "error" };
  }
}
