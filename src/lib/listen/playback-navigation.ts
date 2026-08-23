import { isAudioPostProductKind } from "@/lib/author-products/product-kind";
import {
  isCatalogGlobalPlayerSession,
  type GlobalPlayerSession,
} from "@/lib/listen/global-player-types";
import { buildPracticePublicPath } from "@/lib/products/paths";

export type PlaybackNavigationPolicy = "inline_only" | "fullscreen";

/** Query keys safe to carry from /listen to the public audio_post page. */
const PRESERVED_LISTEN_REDIRECT_QUERY_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "source",
  "campaign",
] as const;

export function resolvePlaybackNavigationPolicy(
  productKind: string | null | undefined,
): PlaybackNavigationPolicy {
  return isAudioPostProductKind(productKind) ? "inline_only" : "fullscreen";
}

export function isInlineOnlyPlaybackSession(
  session: GlobalPlayerSession | null | undefined,
): boolean {
  return Boolean(
    session &&
      isCatalogGlobalPlayerSession(session) &&
      (session.playbackNavigation === "inline_only" ||
        session.entrySurface === "catalog"),
  );
}

export function buildAudioPostListenRedirectPath(
  authorSlug: string,
  productSlug: string,
  searchParams?:
    | URLSearchParams
    | Record<string, string | string[] | undefined>
    | null,
): string {
  const base = buildPracticePublicPath(authorSlug, productSlug);
  const preserved = new URLSearchParams();

  if (!searchParams) {
    return base;
  }

  if (searchParams instanceof URLSearchParams) {
    for (const key of PRESERVED_LISTEN_REDIRECT_QUERY_KEYS) {
      const value = searchParams.get(key);
      if (value) {
        preserved.set(key, value);
      }
    }
  } else {
    for (const key of PRESERVED_LISTEN_REDIRECT_QUERY_KEYS) {
      const raw = searchParams[key];
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (typeof value === "string" && value.trim()) {
        preserved.set(key, value.trim());
      }
    }
  }

  const query = preserved.toString();
  return query ? `${base}?${query}` : base;
}
