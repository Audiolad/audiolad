/**
 * Canonical product-create deep-links for author cabinet.
 * Authoritative query text is never placed in the URL — only reservation UUID
 * or an explicit skip marker.
 */

export const SEO_RESERVATION_ID_PARAM = "seo_reservation_id";
export const SEO_QUERY_SKIP_PARAM = "seo_query";
export const SEO_QUERY_SKIP_VALUE = "skip";

export type BuildAuthorProductCreateHrefInput = {
  authorSlug?: string | null;
  /** Publication class (`release`, `practice`, …). */
  publicationClass?: string | null;
  /** Active reservation UUID when already chosen. */
  reservationId?: string | null;
  /** Explicit escape hatch: continue without SEO reservation. */
  seoQuerySkip?: boolean;
  /** Optional wizard step when already known. */
  step?: string | number | null;
};

export type BuildSeoReservationProductCreateHrefInput = {
  authorSlug: string;
  reservationId: string;
  publicationClass?: string | null;
  step?: string | number | null;
};

export function buildAuthorProductCreateHref(
  input: BuildAuthorProductCreateHrefInput,
): string {
  const params = new URLSearchParams();
  const authorSlug = input.authorSlug?.trim() ?? "";
  const reservationId = input.reservationId?.trim() ?? "";
  const publicationClass = input.publicationClass?.trim() ?? "";

  if (authorSlug) {
    params.set("author", authorSlug);
  }
  if (reservationId) {
    params.set(SEO_RESERVATION_ID_PARAM, reservationId);
  } else if (input.seoQuerySkip) {
    params.set(SEO_QUERY_SKIP_PARAM, SEO_QUERY_SKIP_VALUE);
  }
  if (publicationClass) {
    params.set("class", publicationClass);
  }
  if (
    input.step !== null &&
    input.step !== undefined &&
    String(input.step).trim()
  ) {
    params.set("step", String(input.step).trim());
  }

  const qs = params.toString();
  return qs
    ? `/author-dashboard/products/new?${qs}`
    : "/author-dashboard/products/new";
}

/** Closed-beta: reserved SEO query → product create (keeps prior call sites). */
export function buildSeoReservationProductCreateHref(
  input: BuildSeoReservationProductCreateHrefInput,
): string {
  return buildAuthorProductCreateHref({
    authorSlug: input.authorSlug,
    reservationId: input.reservationId,
    publicationClass: input.publicationClass,
    step: input.step,
  });
}

export function isSeoQuerySkipParam(
  value: string | null | undefined,
): boolean {
  return (
    typeof value === "string" &&
    value.trim().toLowerCase() === SEO_QUERY_SKIP_VALUE
  );
}
