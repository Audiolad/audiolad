export function buildAuthorPublicPath(authorSlug: string): string {
  return `/authors/${authorSlug}`;
}

export function buildPracticePublicPath(
  authorSlug: string,
  productSlug: string,
): string {
  return `/practice/${authorSlug}/${productSlug}`;
}

export function buildPracticeBuyerPreviewPath(
  authorSlug: string,
  productSlug: string,
): string {
  const base = buildPracticePublicPath(authorSlug, productSlug);
  return `${base}?preview=buyer`;
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
