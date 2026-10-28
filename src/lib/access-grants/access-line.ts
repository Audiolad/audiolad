/**
 * Calm access line for the Business cabinet chrome (feedback 23.10.2026, task ba344b7f).
 * Browser-safe and pure. The guest strip («Гостевой режим … Получить 30 дней бесплатно»)
 * is only for real guests: a signed-in visitor with a live gift or paid period sees one quiet
 * line with the end date instead.
 */
import type { CustomerAccessMode } from "./policy";

export type BusinessChromeAccess = {
  mode: CustomerAccessMode;
  /** ISO end of the gift or paid period. Grace does not move it. */
  endsAt: string | null;
  /** ISO instant when music stops. Set only while mode is grace. */
  graceEndsAt?: string | null;
  /**
   * ISO start of the gift (registration). The public-performance licence
   * uses this instant. A payment does not replace it.
   */
  startsAt?: string | null;
};

export const BUSINESS_NO_ACCESS: BusinessChromeAccess = { mode: "none", endsAt: null };

/** Live gift or paid period: the cabinet must not offer the gift again. */
export function hasLiveBusinessAccess(access: BusinessChromeAccess | null | undefined): boolean {
  return Boolean(
    access &&
      (access.mode === "trial" || access.mode === "paid" || access.mode === "grace") &&
      access.endsAt,
  );
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

/**
 * What the cabinet chrome shows: the layout's server peek, or – when that peek ran before the
 * gift was issued (the /workspace page activates it in the same request, and the shared layout
 * is not re-rendered on client navigation) – the live period the workspace itself reported.
 * Only a live report can lift the guest strip; a report never hides a live server value.
 * `server === null` means an anonymous visitor (no peek at all): a report is never applied then.
 */
export function effectiveChromeAccess(
  server: BusinessChromeAccess | null | undefined,
  reported: BusinessChromeAccess | null | undefined,
): BusinessChromeAccess {
  if (server == null) return BUSINESS_NO_ACCESS;
  if (hasLiveBusinessAccess(server)) return server;
  if (hasLiveBusinessAccess(reported)) return reported as BusinessChromeAccess;
  return server;
}

export function businessAccessLine(access: BusinessChromeAccess | null | undefined): string | null {
  if (!access || !hasLiveBusinessAccess(access) || !access.endsAt) return null;
  if (access.mode === "grace" && access.graceEndsAt) {
    const day = formatMoscowDay(access.graceEndsAt);
    return day ? `Музыка играет до ${day}` : null;
  }
  const day = formatMoscowDay(access.endsAt);
  if (!day) return null;
  return access.mode === "paid" ? `Подписка действует до ${day}` : `Бесплатный доступ до ${day}`;
}
