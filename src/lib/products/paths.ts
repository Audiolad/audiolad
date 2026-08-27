export function buildAuthorPublicPath(authorSlug: string): string {
  return `/authors/${authorSlug}`;
}

export function buildPracticePublicPath(
  authorSlug: string,
  productSlug: string,
): string {
  return `/practice/${authorSlug}/${productSlug}`;
}

/** Public one-shot personal-timer trigger. Same query the PDP start handler already consumes. */
export const PRACTICE_PROMO_START_QUERY_PARAM = "promo";

export function buildPracticePromoStartPath(
  authorSlug: string,
  productSlug: string,
  startToken: string,
): string {
  const token = startToken.trim();
  const base = buildPracticePublicPath(authorSlug, productSlug);

  if (!token) {
    return base;
  }

  return `${base}?${PRACTICE_PROMO_START_QUERY_PARAM}=${encodeURIComponent(token)}`;
}

export function parsePracticePublicPath(
  href: string | null | undefined,
): { authorSlug: string; productSlug: string } | null {
  if (!href) {
    return null;
  }

  const pathname = href.split("?")[0]?.split("#")[0] ?? "";
  const parts = pathname.split("/").filter(Boolean);

  if (parts.length < 3 || parts[0] !== "practice") {
    return null;
  }

  const authorSlug = parts[1]?.trim() ?? "";
  const productSlug = parts[2]?.trim() ?? "";

  if (!authorSlug || !productSlug) {
    return null;
  }

  return { authorSlug, productSlug };
}

export function buildPracticeBuyerPreviewPath(
  authorSlug: string,
  productSlug: string,
): string {
  const base = buildPracticePublicPath(authorSlug, productSlug);
  return `${base}?preview=buyer`;
}

export function buildPracticePublishPreviewPath(
  authorSlug: string,
  productSlug: string,
): string {
  const base = buildPracticePublicPath(authorSlug, productSlug);
  return `${base}?preview=publish`;
}

/** Clean listener simulation of a draft; requires publish-preview access gate. */
export function buildPracticePublishListenerPreviewPath(
  authorSlug: string,
  productSlug: string,
): string {
  return `${buildPracticePublishPreviewPath(authorSlug, productSlug)}&view=listener`;
}

/**
 * Author-only personal-timer preview. Reuses listener preview params and
 * adds `promo_preview={promotionId}` — never the public `?promo=` token.
 */
export function buildPracticePromoPreviewPath(
  authorSlug: string,
  productSlug: string,
  promotionId: string,
): string {
  const encoded = encodeURIComponent(promotionId.trim());
  return `${buildPracticePublishListenerPreviewPath(authorSlug, productSlug)}&promo_preview=${encoded}`;
}

export function buildListenPath(
  authorSlug: string,
  productSlug: string,
  options?: { autoplay?: boolean },
): string {
  const base = `/listen/${authorSlug}/${productSlug}`;

  if (shouldRequestListenAutoplay(options)) {
    return `${base}?${LISTEN_AUTOPLAY_QUERY_PARAM}=${LISTEN_AUTOPLAY_QUERY_VALUE}`;
  }

  return base;
}

export function buildListenApiBase(
  authorSlug: string,
  productSlug: string,
): string {
  return `/api/listen/product/${authorSlug}/${productSlug}`;
}

import { getAppOrigin } from "@/lib/seo/app-origin";
import {
  LISTEN_AUTOPLAY_QUERY_PARAM,
  LISTEN_AUTOPLAY_QUERY_VALUE,
  shouldRequestListenAutoplay,
} from "@/lib/listen/autoplay-intent";

export function buildPracticeCanonicalUrl(
  authorSlug: string,
  productSlug: string,
): string {
  return `${getAppOrigin()}${buildPracticePublicPath(authorSlug, productSlug)}`;
}
