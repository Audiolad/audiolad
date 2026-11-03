/**
 * Device family from the User-Agent header (task 253821e0, PR 3).
 * Only the three labels are kept; the raw User-Agent is never stored or logged.
 */

export type BusinessDeviceClass = "phone" | "tablet" | "computer";
export type BusinessOsFamily = "android" | "ios" | "windows" | "macos" | "linux" | "chromeos" | "other";
export type BusinessBrowserFamily =
  | "yandex" | "chrome" | "safari" | "firefox" | "edge" | "opera" | "samsung" | "max" | "telegram" | "other";

export type BusinessDeviceFamily = {
  deviceClass: BusinessDeviceClass | null;
  osFamily: BusinessOsFamily | null;
  browserFamily: BusinessBrowserFamily | null;
};

const EMPTY: BusinessDeviceFamily = { deviceClass: null, osFamily: null, browserFamily: null };

function osFamily(ua: string): BusinessOsFamily {
  if (/windows nt|windows phone/.test(ua)) return "windows";
  if (/android/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/cros/.test(ua)) return "chromeos";
  if (/mac os x|macintosh/.test(ua)) return "macos";
  if (/linux|x11/.test(ua)) return "linux";
  return "other";
}

function browserFamily(ua: string): BusinessBrowserFamily {
  if (/yabrowser|yaapp_|yandexsearch|yasearchbrowser/.test(ua)) return "yandex";
  if (/telegram/.test(ua)) return "telegram";
  if (/\bmax\/\d|oneme/.test(ua)) return "max";
  if (/samsungbrowser/.test(ua)) return "samsung";
  if (/edg(e|a|ios)?\//.test(ua)) return "edge";
  if (/opr\/|opera|opt\//.test(ua)) return "opera";
  if (/firefox|fxios/.test(ua)) return "firefox";
  if (/chrome|crios|chromium/.test(ua)) return "chrome";
  if (/safari|applewebkit/.test(ua)) return "safari";
  return "other";
}

function deviceClass(ua: string, os: BusinessOsFamily): BusinessDeviceClass {
  if (/ipad|tablet|kindle|silk|playbook/.test(ua)) return "tablet";
  if (os === "android") return /mobile/.test(ua) ? "phone" : "tablet";
  if (/iphone|ipod|windows phone|mobile/.test(ua)) return "phone";
  return "computer";
}

export function businessDeviceFamily(userAgent: string | null | undefined): BusinessDeviceFamily {
  if (typeof userAgent !== "string") return EMPTY;
  const ua = userAgent.slice(0, 1024).toLowerCase();
  if (!ua.trim()) return EMPTY;
  const os = osFamily(ua);
  return { deviceClass: deviceClass(ua, os), osFamily: os, browserFamily: browserFamily(ua) };
}
