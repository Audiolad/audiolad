import { isInAppBrowser, isIosDevice } from "@/lib/pwa/platform";

export const STUDIO_IN_APP_ROTATE_HINT_DISMISSED_KEY =
  "audiolad.studio.inAppRotateHint.dismissed";

const IOS_ALT_BROWSER_RE = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser/i;

export type StudioInAppRotateHintInput = {
  isInApp?: boolean;
  isStandalone?: boolean;
  isPortrait?: boolean;
  isMobileViewport?: boolean;
  dismissed?: boolean;
};

export type StudioEmbeddedBrowserInput = {
  userAgent: string;
  hasSafariGlobal?: boolean | null;
  isStandalone?: boolean;
};

/**
 * Fail-safe visibility for the Studio in-app/embedded browser hint.
 * Defaults to false when flags are missing. Callers must not invoke this
 * during SSR with live window state — pass explicit booleans instead.
 */
export function shouldShowStudioInAppRotateHint(
  input: StudioInAppRotateHintInput = {},
): boolean {
  if (input.isInApp !== true) {
    return false;
  }

  if (input.isStandalone === true) {
    return false;
  }

  if (input.isPortrait !== true) {
    return false;
  }

  if (input.isMobileViewport !== true) {
    return false;
  }

  if (input.dismissed === true) {
    return false;
  }

  return true;
}

/** Named-app in-app browsers (Telegram, MAX-if-present, FB, VK, …). */
export function isNamedInAppUserAgent(userAgent: string): boolean {
  return isInAppBrowser(userAgent);
}

export function isIosSafariUserAgent(userAgent: string): boolean {
  if (!isIosDevice(userAgent)) {
    return false;
  }

  if (!/Version\/[\d.]+/.test(userAgent) || !/Safari\//.test(userAgent)) {
    return false;
  }

  if (IOS_ALT_BROWSER_RE.test(userAgent)) {
    return false;
  }

  if (isInAppBrowser(userAgent)) {
    return false;
  }

  return true;
}

/** Classic stock iOS WKWebView: AppleWebKit + Mobile/ and no Safari/ token. */
export function isIosWebViewUserAgent(userAgent: string): boolean {
  if (!isIosDevice(userAgent)) {
    return false;
  }

  if (!/AppleWebKit/i.test(userAgent) || !/Mobile\//i.test(userAgent)) {
    return false;
  }

  if (/Safari\//i.test(userAgent)) {
    return false;
  }

  if (IOS_ALT_BROWSER_RE.test(userAgent)) {
    return false;
  }

  return true;
}

/**
 * Studio-only iOS embedded-browser heuristic.
 * Real Safari has window.safari; WKWebView (including MAX iOS) typically does not.
 * All flags are explicit so unit tests do not need window.
 */
export function isProbableIosEmbeddedBrowser(
  input: StudioEmbeddedBrowserInput,
): boolean {
  const userAgent = input.userAgent;

  if (!isIosDevice(userAgent)) {
    return false;
  }

  if (input.isStandalone === true) {
    return false;
  }

  if (IOS_ALT_BROWSER_RE.test(userAgent)) {
    return false;
  }

  if (isInAppBrowser(userAgent)) {
    return true;
  }

  if (input.hasSafariGlobal === true) {
    return false;
  }

  if (input.hasSafariGlobal === false) {
    return true;
  }

  return isIosWebViewUserAgent(userAgent);
}

export function resolveStudioInApp(input: StudioEmbeddedBrowserInput): boolean {
  return (
    isInAppBrowser(input.userAgent) || isProbableIosEmbeddedBrowser(input)
  );
}

export function isStudioBrowserDebugQuery(search: string): boolean {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("studioBrowserDebug") === "1";
}

export function truncateStudioBrowserDebugUserAgent(
  userAgent: string,
  maxLength = 240,
): string {
  if (userAgent.length <= maxLength) {
    return userAgent;
  }

  return `${userAgent.slice(0, maxLength)}…`;
}
