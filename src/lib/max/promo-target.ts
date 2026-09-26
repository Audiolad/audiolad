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
