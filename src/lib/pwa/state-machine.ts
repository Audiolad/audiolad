import type { PwaInstallState } from "@/lib/pwa/constants";
import type { PwaInstallCapability } from "@/lib/pwa/platform";

export type PwaBannerDecisionInput = {
  isAuthenticated: boolean;
  isAuthReady: boolean;
  pathname: string;
  isStandalone: boolean;
  hasValueMoment: boolean;
  installState: PwaInstallState;
  installCapability: PwaInstallCapability;
  bannerShownThisSession: boolean;
  dismissedUntil: number | null;
  promptAcceptedAt: number | null;
  now?: number;
};

export function isAuthRoute(pathname: string): boolean {
  return pathname.startsWith("/auth/");
}

export function isCabinetRoute(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }

  const prefixes = [
    "/profile",
    "/my-practices",
    "/playlists",
    "/history",
    "/settings",
    "/favorites",
    "/downloads",
    "/purchases",
  ];

  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isExcludedBannerRoute(pathname: string): boolean {
  const prefixes = [
    "/auth/",
    "/listen/",
    "/checkout/",
    "/author-dashboard/",
  ];

  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

export function shouldShowPwaBanner(input: PwaBannerDecisionInput): boolean {
  const now = input.now ?? Date.now();

  if (!input.isAuthReady) {
    return false;
  }

  if (!input.isAuthenticated) {
    return false;
  }

  if (isAuthRoute(input.pathname) || isExcludedBannerRoute(input.pathname)) {
    return false;
  }

  if (!isCabinetRoute(input.pathname)) {
    return false;
  }

  if (input.isStandalone) {
    return false;
  }

  if (input.installState === "installed_confirmed") {
    return false;
  }

  if (!input.hasValueMoment) {
    return false;
  }

  if (input.dismissedUntil && input.dismissedUntil > now) {
    return false;
  }

  if (input.bannerShownThisSession) {
    return false;
  }

  if (input.promptAcceptedAt) {
    return false;
  }

  return (
    input.installCapability === "prompt_available" ||
    input.installCapability === "instructions_only"
  );
}

export function shouldTrackPwaAnalyticsOnce(
  recordedKeys: Set<string>,
  key: string,
): boolean {
  if (recordedKeys.has(key)) {
    return false;
  }

  recordedKeys.add(key);
  return true;
}

export function mapInstallStateToCapability(
  hasDeferredPrompt: boolean,
  userAgent: string,
): PwaInstallCapability {
  if (hasDeferredPrompt) {
    return "prompt_available";
  }

  const isIos =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (userAgent.includes("Mac") && userAgent.includes("Mobile"));

  if (isIos) {
    return "instructions_only";
  }

  const isAndroid = /Android/.test(userAgent);
  const isDesktop = !isIos && !isAndroid;

  if (isDesktop) {
    return "instructions_only";
  }

  return "unsupported";
}
