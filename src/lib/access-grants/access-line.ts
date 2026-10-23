/**
 * Calm access line for the Business cabinet chrome (feedback 23.10.2026, task ba344b7f).
 * Browser-safe and pure. The guest strip («Гостевой режим … Получить 30 дней бесплатно»)
 * is only for real guests: a signed-in visitor with a live gift or paid period sees one quiet
 * line with the end date instead.
 */
import type { CustomerAccessMode } from "./policy";

export type BusinessChromeAccess = {
  mode: CustomerAccessMode;
  /** ISO end of the live period (gift or paid); null when there is none. */
  endsAt: string | null;
};

export const BUSINESS_NO_ACCESS: BusinessChromeAccess = { mode: "none", endsAt: null };

/** Live gift or paid period: the cabinet must not offer the gift again. */
export function hasLiveBusinessAccess(access: BusinessChromeAccess | null | undefined): boolean {
  return Boolean(access && (access.mode === "trial" || access.mode === "paid") && access.endsAt);
}

/** «22 ноября 2026» in Moscow time. */
export function formatMoscowDay(iso: string): string | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(date)
    .replace(/\s*г\.?$/u, "");
}

export function businessAccessLine(access: BusinessChromeAccess | null | undefined): string | null {
  if (!access || !hasLiveBusinessAccess(access) || !access.endsAt) return null;
  const day = formatMoscowDay(access.endsAt);
  if (!day) return null;
  return access.mode === "paid" ? `Подписка действует до ${day}` : `Бесплатный доступ до ${day}`;
}
