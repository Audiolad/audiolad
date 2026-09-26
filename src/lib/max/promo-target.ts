export type MaxPromoTarget = {
  authorSlug: string;
  promoSlug: string;
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseMaxPromoTarget(value: string | null | undefined): MaxPromoTarget | null {
  const raw = value?.trim();
  if (!raw) return null;

  const parts = raw.split("/").filter(Boolean);
  if (parts.length !== 2) return null;

  const [authorSlug, promoSlug] = parts;
  if (!SLUG_RE.test(authorSlug) || !SLUG_RE.test(promoSlug)) return null;

  return { authorSlug, promoSlug };
}

export function readMaxPromoTargetFromLocation(): MaxPromoTarget | null {
  if (typeof window === "undefined") return null;
  return parseMaxPromoTarget(new URLSearchParams(window.location.search).get("promo"));
}


export function buildPublicPromoFallbackUrl(
  locationHref: string,
  target: MaxPromoTarget,
): string | null {
  let source: URL;
  try {
    source = new URL(locationHref);
  } catch {
    return null;
  }

  const fallback = new URL(
    `/promo/${target.authorSlug}/${target.promoSlug}`,
    "https://audiolad.ru",
  );

  for (const [key, value] of source.searchParams.entries()) {
    if (key === "promo") continue;
    fallback.searchParams.append(key, value);
  }

  return fallback.toString();
}

export function resolveMaxPromoBrowserFallback(input: {
  locationHref: string;
  inMax: boolean;
  initData: string | null;
}): string | null {
  if (input.inMax || input.initData) return null;

  let source: URL;
  try {
    source = new URL(input.locationHref);
  } catch {
    return null;
  }

  const target = parseMaxPromoTarget(source.searchParams.get("promo"));
  if (!target) return null;

  return buildPublicPromoFallbackUrl(source.toString(), target);
}
