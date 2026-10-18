export type AdminNavBadgeTone = "default" | "attention";

/** Visible badge text, or null when there is nothing to show (0, negative, NaN, missing). */
export function formatAdminNavBadgeCount(count: number | null | undefined): string | null {
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) {
    return null;
  }

  const whole = Math.floor(count);
  if (whole <= 0) {
    return null;
  }

  return whole > 99 ? "99+" : String(whole);
}
