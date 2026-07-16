import type { PwaPlatform } from "@/lib/pwa/constants";

declare global {
  interface Navigator {
    standalone?: boolean;
  }
}

export function isBrowserEnvironment(): boolean {
  return typeof window !== "undefined";
}

export function isStandaloneMode(): boolean {
  if (!isBrowserEnvironment()) {
    return false;
  }

  const displayModeStandalone = window.matchMedia(
    "(display-mode: standalone)",
  ).matches;
  const displayModeFullscreen = window.matchMedia(
    "(display-mode: fullscreen)",
  ).matches;
  const iosStandalone = window.navigator.standalone === true;

  return displayModeStandalone || displayModeFullscreen || iosStandalone;
}

export function isIosDevice(userAgent: string): boolean {
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (typeof navigator !== "undefined" &&
      navigator.platform === "MacIntel" &&
      navigator.maxTouchPoints > 1)
  );
}

export function isIosSafari(userAgent: string): boolean {
  if (!isIosDevice(userAgent)) {
    return false;
  }

  const isOtherIosBrowser =
    /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(userAgent);

  return !isOtherIosBrowser;
}

export function isAndroidDevice(userAgent: string): boolean {
  return /Android/.test(userAgent);
}

export function isDesktopEnvironment(userAgent: string): boolean {
  return !isIosDevice(userAgent) && !isAndroidDevice(userAgent);
}

export function isChromiumBrowser(userAgent: string): boolean {
  return /Chrome|Edg|OPR|Brave/.test(userAgent) && !/Firefox/.test(userAgent);
}

/** Telegram, MAX and other embedded in-app browsers without reliable PWA install. */
export function isInAppBrowser(userAgent: string): boolean {
  return (
    /Telegram/i.test(userAgent) ||
    /\bMAX\b/i.test(userAgent) ||
    /Instagram|FBAN|FBAV|Line\/|MicroMessenger|Twitter|LinkedInApp/i.test(
      userAgent,
    )
  );
}

export function detectPwaPlatform(userAgent: string): PwaPlatform {
  if (isIosDevice(userAgent)) {
    return "ios";
  }

  if (isAndroidDevice(userAgent)) {
    return "android";
  }

  if (isChromiumBrowser(userAgent)) {
    return "desktop_chromium";
  }

  if (isDesktopEnvironment(userAgent)) {
    return "desktop_other";
  }

  return "unknown";
}

export type PwaInstallCapability =
  | "prompt_available"
  | "instructions_only"
  | "unsupported";

export function resolveInstallCapability(input: {
  userAgent: string;
  hasDeferredPrompt: boolean;
}): PwaInstallCapability {
  if (isInAppBrowser(input.userAgent)) {
    return "instructions_only";
  }

  if (input.hasDeferredPrompt) {
    return "prompt_available";
  }

  if (isIosSafari(input.userAgent) || isIosDevice(input.userAgent)) {
    return "instructions_only";
  }

  if (isDesktopEnvironment(input.userAgent)) {
    return "instructions_only";
  }

  if (isAndroidDevice(input.userAgent)) {
    return "instructions_only";
  }

  return "unsupported";
}

export function isDesktopSafari(userAgent: string): boolean {
  return (
    isDesktopEnvironment(userAgent) &&
    /Safari/.test(userAgent) &&
    !isChromiumBrowser(userAgent)
  );
}

export function isDesktopEdge(userAgent: string): boolean {
  return isDesktopEnvironment(userAgent) && /Edg\//.test(userAgent);
}

export function isDesktopChrome(userAgent: string): boolean {
  return (
    isDesktopEnvironment(userAgent) &&
    /Chrome\//.test(userAgent) &&
    !/Edg\//.test(userAgent)
  );
}

export function resolveInstallDialogMode(input: {
  userAgent: string;
  platform: import("@/lib/pwa/constants").PwaPlatform;
  isInApp: boolean;
}): import("@/lib/pwa/types").PwaInstallDialogMode {
  if (input.isInApp) {
    return "in_app_browser";
  }

  if (input.platform === "ios") {
    return "ios";
  }

  if (input.platform === "android") {
    return "android";
  }

  if (isDesktopSafari(input.userAgent)) {
    return "desktop_safari";
  }

  if (isDesktopEdge(input.userAgent)) {
    return "desktop_edge";
  }

  if (isDesktopChrome(input.userAgent)) {
    return "desktop_chrome";
  }

  return "desktop_bookmark";
}

export function getMobileInstallBannerHint(input: {
  platform: import("@/lib/pwa/constants").PwaPlatform;
  isInApp: boolean;
}): string {
  if (input.isInApp) {
    return "Для установки откройте АудиоЛад во внешнем браузере.";
  }

  if (input.platform === "ios") {
    return "Откройте АудиоЛад в Safari, нажмите «Поделиться» и выберите «На экран Домой».";
  }

  if (input.platform === "android") {
    return "Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».";
  }

  return "Добавьте АудиоЛад на экран телефона и открывайте свои практики одним касанием.";
}

export function resolveUiVariant(userAgent: string): "mobile" | "desktop" {
  return isDesktopEnvironment(userAgent) ? "desktop" : "mobile";
}

export function isAuthRoute(pathname: string): boolean {
  return pathname.startsWith("/auth/");
}

export function isCabinetRoute(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }

  const cabinetPrefixes = [
    "/profile",
    "/my-practices",
    "/playlists",
    "/history",
    "/settings",
    "/favorites",
    "/downloads",
    "/purchases",
  ];

  return cabinetPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isExcludedBannerRoute(pathname: string): boolean {
  const excludedPrefixes = [
    "/auth/",
    "/listen/",
    "/checkout/",
    "/author-dashboard/",
  ];

  return excludedPrefixes.some((prefix) => pathname.startsWith(prefix));
}

export function isValueMomentRoute(pathname: string): boolean {
  return (
    pathname === "/my-practices" ||
    pathname.startsWith("/my-practices/") ||
    pathname === "/listen" ||
    pathname.startsWith("/listen/")
  );
}
