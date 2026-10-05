/**
 * Day-5 SEO reservation reminder eligibility.
 * Mirrors claim_seo_reservation_5d_reminders / seo_reservation_blocks_5d_reminder.
 * Booked_at column is reserved_at. 7-day expiry stays on expires_at / expire RPC.
 */

export const SEO_RESERVATION_5D_REMINDER_SUBJECT =
  "Напоминание о забронированном запросе на АудиоЛаде";

export const SEO_RESERVATION_5D_FULL_DAYS = 5;

export type SeoReservation5dReminderProductGate = {
  status: string;
  moderationStatus: string;
  deletedAt?: string | null;
};

export type SeoReservation5dReminderFields = {
  status: string;
  reservedAt: string;
  expiresAt: string | null;
  reminder5dSentAt: string | null;
  product: SeoReservation5dReminderProductGate | null;
};

/** Linked product blocks the reminder when published or already on/after moderation submit. */
export function seoReservationProductBlocks5dReminder(
  product: SeoReservation5dReminderProductGate | null,
): boolean {
  if (!product) return false;
  if (product.deletedAt) return false;
  if (product.status === "published") return true;
  return (
    product.moderationStatus !== "not_submitted" &&
    product.moderationStatus !== "changes_requested"
  );
}

export function isSeoReservationDueFor5dReminder(
  reservation: SeoReservation5dReminderFields,
  now: Date = new Date(),
): boolean {
  if (reservation.status !== "active") return false;
  if (reservation.reminder5dSentAt) return false;

  const reservedAt = new Date(reservation.reservedAt);
  if (Number.isNaN(reservedAt.getTime())) return false;
  const ageMs = now.getTime() - reservedAt.getTime();
  if (ageMs < SEO_RESERVATION_5D_FULL_DAYS * 24 * 60 * 60 * 1000) {
    return false;
  }

  if (reservation.expiresAt) {
    const expiresAt = new Date(reservation.expiresAt);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime()) {
      return false;
    }
  }

  if (seoReservationProductBlocks5dReminder(reservation.product)) {
    return false;
  }

  return true;
}

export function isValidReminderRecipientEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function formatSeoReservationExpiresAtMsk(expiresAt: string): string | null {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(date);
}
