/**
 * Mirrors lazy expiry in public.expire_seo_query_reservation:
 * active + no product + expires_at <= now → not effective.
 * used stays effective; active with product stays effective.
 */
export type SeoReservationExpiryFields = {
  status: string;
  productId: string | null;
  expiresAt: string | null;
};

export function isEffectiveSeoReservation(
  reservation: SeoReservationExpiryFields,
  now: Date = new Date(),
): boolean {
  if (reservation.status === "used") {
    return true;
  }
  if (reservation.status !== "active") {
    return false;
  }
  if (reservation.productId) {
    return true;
  }
  if (!reservation.expiresAt) {
    return true;
  }
  const expiresAt = new Date(reservation.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    return true;
  }
  return expiresAt.getTime() > now.getTime();
}
