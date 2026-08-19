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

export function studioShareUrlFromHref(href: string): string {
  try {
    const parsed = new URL(href);
    parsed.searchParams.delete("studioBrowserDebug");
    return parsed.href;
  } catch {
    return href;
  }
}

const STUDIO_PROJECT_PATH =
  /^\/studio\/project\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

const STUDIO_GUEST_HANDOFF_URL_MARK = "/studio/try/handoff?t=";

export function studioProjectIdFromPathname(pathname: string): string | undefined {
  const match = pathname.match(STUDIO_PROJECT_PATH);
  return match?.[1];
}

export function resolveStudioShareProjectId(
  projectId?: string | null,
  pathname?: string,
): string | undefined {
  if (typeof projectId === "string" && projectId.length > 0) {
    const fromId = studioProjectIdFromPathname(`/studio/project/${projectId}`);
    if (fromId) {
      return fromId;
    }
  }
  if (typeof pathname === "string" && pathname.length > 0) {
    return studioProjectIdFromPathname(pathname);
  }
  return undefined;
}

export function isStudioGuestHandoffShareUrl(url: string): boolean {
  return typeof url === "string" && url.includes(STUDIO_GUEST_HANDOFF_URL_MARK);
}

export type StudioBannerShareCopyPlan =
  | { action: "handoff"; projectId: string }
  | { action: "href"; href: string }
  | { action: "error" };

/**
 * Banner «Скопировать ссылку» plan.
 * Only authenticated author copies the current project URL.
 * Guest (or missing mode) never falls back to /studio/project/:id.
 */
export function resolveStudioBannerShareCopy(input: {
  accessMode?: "author" | "guest" | null;
  projectId?: string | null;
  pathname?: string;
  href: string;
}): StudioBannerShareCopyPlan {
  const projectId = resolveStudioShareProjectId(input.projectId, input.pathname);
  if (input.accessMode !== "author") {
    if (!projectId) {
      return { action: "error" };
    }
    return { action: "handoff", projectId };
  }
  return { action: "href", href: studioShareUrlFromHref(input.href) };
}

export type StudioBannerShareCopyOutcome =
  | { status: "copied" | "manual"; url: string }
  | { status: "error" };

export async function performStudioBannerShareCopy(input: {
  accessMode?: "author" | "guest" | null;
  projectId?: string | null;
  pathname?: string;
  href: string;
  createHandoff: (projectId: string) => Promise<{ url: string }>;
  copyShareUrl: (href: string) => Promise<CopyStudioShareUrlResult>;
}): Promise<StudioBannerShareCopyOutcome> {
  const plan = resolveStudioBannerShareCopy(input);
  if (plan.action === "error") {
    return { status: "error" };
  }
  if (plan.action === "href") {
    const copied = await input.copyShareUrl(plan.href);
    return { status: copied.result, url: copied.url };
  }
  try {
    const { url } = await input.createHandoff(plan.projectId);
    if (!isStudioGuestHandoffShareUrl(url)) {
      return { status: "error" };
    }
    const copied = await input.copyShareUrl(url);
    return { status: copied.result, url: copied.url };
  } catch {
    return { status: "error" };
  }
}

export type CopyStudioShareUrlAdapters = {
  href: string;
  writeText?: ((text: string) => Promise<void> | void) | null;
  execCopy?: ((text: string) => boolean | Promise<boolean>) | null;
};

export type CopyStudioShareUrlResult = {
  url: string;
  result: "copied" | "manual";
};

/**
 * iOS/WebView-safe execCommand("copy").
 * Offscreen (`left: -9999px`) + readonly-only fields fail in MAX iOS WKWebView
 * because iOS cannot select those nodes.
 */
export function copyTextWithVisibleExecCommand(text: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("aria-hidden", "true");
  field.tabIndex = -1;
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.left = "0";
  field.style.opacity = "0";
  field.style.width = "1px";
  field.style.height = "1px";
  field.style.padding = "0";
  field.style.margin = "0";
  field.style.border = "0";
  field.style.outline = "none";
  field.style.overflow = "hidden";
  field.style.fontSize = "16px";
  document.body.appendChild(field);
  field.focus();
  field.select();
  field.setSelectionRange(0, text.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

export async function copyStudioShareUrl({
  href,
  writeText,
  execCopy,
}: CopyStudioShareUrlAdapters): Promise<CopyStudioShareUrlResult> {
  const url = studioShareUrlFromHref(href);

  if (typeof writeText === "function") {
    try {
      await writeText(url);
      return { url, result: "copied" };
    } catch {
      // Clipboard API rejected or unavailable after a probe — continue.
    }
  }

  if (typeof execCopy === "function") {
    try {
      const ok = await execCopy(url);
      if (ok) {
        return { url, result: "copied" };
      }
    } catch {
      // execCommand returned false or threw — continue to manual.
    }
  }

  return { url, result: "manual" };
}
