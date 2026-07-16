import type { LoadSessionInput } from "@/lib/listen/global-player-types";
import { buildListenApiBase, buildListenPath } from "@/lib/products/paths";

export type FetchListenSessionResult =
  | { ok: true; session: LoadSessionInput }
  | { ok: false; reason: string };

export function isSafeListenPath(pathname: string): boolean {
  if (!pathname.startsWith("/listen/")) {
    return false;
  }

  if (pathname.includes("://") || pathname.includes("\\") || pathname.startsWith("//")) {
    return false;
  }

  const parts = pathname.split("?")[0]?.split("/").filter(Boolean) ?? [];
  return parts.length >= 3 && parts[0] === "listen";
}

export async function fetchListenSessionPayload(
  authorSlug: string,
  productSlug: string,
  options?: { fromStart?: boolean },
): Promise<FetchListenSessionResult> {
  const base = buildListenApiBase(authorSlug, productSlug);
  const url = options?.fromStart
    ? `${base}/session?fromStart=1`
    : `${base}/session`;

  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });

    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      session?: LoadSessionInput;
      reason?: string;
    } | null;

    if (!response.ok || !data?.ok || !data.session) {
      return {
        ok: false,
        reason: data?.reason || "unavailable",
      };
    }

    // Never trust client-supplied audio URLs — session payload must not include them.
    return { ok: true, session: data.session };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export function buildSafeListenReplacePath(
  authorSlug: string,
  productSlug: string,
): string | null {
  const path = buildListenPath(authorSlug, productSlug);

  if (!isSafeListenPath(path)) {
    return null;
  }

  return path;
}
