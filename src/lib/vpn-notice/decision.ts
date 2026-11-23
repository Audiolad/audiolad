/**
 * Pure rules for the «выключите VPN» notice (t1651u).
 * Shown only to a visitor whose IP is outside Russia, once per visit window,
 * and never on hall-device playback routes.
 */

export const VPN_NOTICE_TEXT = "Для удобной работы сервиса выключите VPN";

export const VPN_NOTICE_STORAGE_KEY = "audiolad.vpn-notice.shown-until";

/** How long the flag is kept after the notice was shown. */
export const VPN_NOTICE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Visible, then fades out. */
export const VPN_NOTICE_VISIBLE_MS = 7000;

const NOTICE_HOSTS = new Set([
  "audiolad.ru",
  "www.audiolad.ru",
  "coffee.audiolad.ru",
  "business.audiolad.ru",
]);

const HALL_PATHS = ["/point", "/player", "/spa", "/owner", "/workspace"] as const;

export function isVpnNoticeHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "").split(":")[0] ?? "";
  return NOTICE_HOSTS.has(host);
}

/** Public or internal (/business-app/…) path of a hall device / playback screen. */
export function isVpnNoticeHallPath(pathname: string): boolean {
  const path = normalizeNoticePath(pathname);
  return HALL_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function normalizeNoticePath(pathname: string): string {
  const raw = (pathname.split("?")[0] ?? "/").trim() || "/";
  const noSlash = raw.replace(/\/+$/, "") || "/";
  if (noSlash === "/business-app") return "/";
  if (noSlash.startsWith("/business-app/")) {
    return noSlash.slice("/business-app".length) || "/";
  }
  return noSlash;
}

export type VpnNoticeDecisionInput = {
  country: string | null | undefined;
  pathname: string;
  shownUntil?: number | null;
  hallDevice?: boolean;
  hostname?: string;
  now?: number;
};

/**
 * RU or an unknown country: no notice.
 * A known non-RU country: notice, unless the 7-day flag is set, the route is a hall
 * player, this browser is a hall device, or the host is not the public site / coffee cabinet.
 */
export function shouldShowVpnNotice(input: VpnNoticeDecisionInput): boolean {
  if (input.hostname != null && !isVpnNoticeHost(input.hostname)) return false;
  if (input.hallDevice) return false;
  if (isVpnNoticeHallPath(input.pathname)) return false;
  const country = (input.country ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country) || country === "RU") return false;
  const now = input.now ?? Date.now();
  if (input.shownUntil != null && input.shownUntil > now) return false;
  return true;
}

export function parseVpnNoticeShownUntil(raw: string | null | undefined): number | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const value = Number(raw.trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}
