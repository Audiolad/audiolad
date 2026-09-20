/**
 * Canonical deep-link for closed-beta: reserved SEO query → product create.
 * Authoritative query text is never placed in the URL — only reservation UUID.
 */

export const SEO_RESERVATION_ID_PARAM = "seo_reservation_id";

export type BuildSeoReservationProductCreateHrefInput = {
  authorSlug: string;
  reservationId: string;
  /** Optional publication class (`release`, `practice`, …) when already chosen. */
  publicationClass?: string | null;
  /** Optional wizard step when already known. */
  step?: string | number | null;
};

export function buildSeoReservationProductCreateHref(
  input: BuildSeoReservationProductCreateHrefInput,
): string {
  const params = new URLSearchParams();
  const authorSlug = input.authorSlug.trim();
  const reservationId = input.reservationId.trim();

  if (authorSlug) {
    params.set("author", authorSlug);
  }
  if (reservationId) {
    params.set(SEO_RESERVATION_ID_PARAM, reservationId);
  }
  if (input.publicationClass?.trim()) {
    params.set("class", input.publicationClass.trim());
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
