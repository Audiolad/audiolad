import { BUSINESS_SITE_PATH, isBusinessHostname } from "@/lib/business-app/host";
import { normalizePointCode } from "@/lib/business-app/point-session";

export const POINT_SHARE_TITLE = "Устройство в зале – АудиоЛад Бизнес";

/**
 * Link to the device connection page. The code goes into the fragment (#1234):
 * browsers never send the fragment to the server, so nginx and server logs do not see it.
 */
export function pointDeviceLink(origin: string, hostname: string, code?: string | null): string {
  const path = isBusinessHostname(hostname) ? "/point" : `${BUSINESS_SITE_PATH}/point`;
  const clean = code ? normalizePointCode(code) : null;
  return `${origin.replace(/\/+$/, "")}${path}${clean ? `#${clean}` : ""}`;
}

export function pointShareText(code?: string | null): string {
  const clean = code ? normalizePointCode(code) : null;
  return clean
    ? `Откройте ссылку на устройстве у колонки в кофейне – оно подключится само. Код ${clean} действует 10 минут.`
    : "Откройте ссылку на устройстве у колонки в кофейне и введите код из кабинета.";
}

/** Telegram share intent. Telegram receives the link, so the code leaves our servers here. */
export function pointTelegramShareUrl(link: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
}

export function pointMailtoUrl(link: string, text: string): string {
  return `mailto:?subject=${encodeURIComponent(POINT_SHARE_TITLE)}&body=${encodeURIComponent(`${text}\n\n${link}`)}`;
}

/** Seconds left before the code expires, never negative. */
export function pointCodeSecondsLeft(expiresAt: string | null | undefined, nowMs: number): number {
  const at = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, Math.floor((at - nowMs) / 1000));
}

/** Russian minutes for the retry hint: 1 минуту, 2 минуты, 5 минут. */
export function pointWaitMinutes(seconds: number): string {
  const n = Math.max(1, Math.ceil(seconds / 60));
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? "минуту"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? "минуты"
      : "минут";
  return `${n} ${word}`;
}
