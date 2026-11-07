/** A preference only. Always resolve against the caller's RLS-visible organization rows. */
export const BUSINESS_LOCATION_COOKIE = "al-business-location";
export function selectBusinessLocation<T extends { id: string; status: string }>(rows: readonly T[], requested?: string): T | null {
  const active = rows.filter((row) => row.status === "active");
  return active.find((row) => row.id === requested) ?? active[0] ?? null;
}
/**
 * Existing halls in creation order, plus one empty "add" slot while the organization is below
 * its limit. Halls are never hidden if the limit was lowered later.
 */
export function businessPilotSlots<T>(rows: readonly T[], limit: number): Array<{ number: number; location: T | null }> {
  const length = Math.max(rows.length, Math.min(rows.length + 1, limit));
  return Array.from({ length }, (_, index) => ({ number: index + 1, location: rows[index] ?? null }));
}
