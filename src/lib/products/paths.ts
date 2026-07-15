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

  if (options?.autoplay) {
    return `${base}?autoplay=1`;
  }

  return base;
}

export function buildListenApiBase(
  authorSlug: string,
  productSlug: string,
): string {
  return `/api/listen/product/${authorSlug}/${productSlug}`;
}

export function buildPracticeCanonicalUrl(
  authorSlug: string,
  productSlug: string,
): string {
  return `https://audiolad.ru${buildPracticePublicPath(authorSlug, productSlug)}`;
}
