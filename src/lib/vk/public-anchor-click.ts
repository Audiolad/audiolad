import { isVkPublicFooterUrl, openVkGuestExternalUrl } from "@/lib/vk/guest-links";

export type VkPublicAnchorClickEvent = {
  preventDefault: () => void;
};

export type VkPublicAnchorClient = "mobile" | "desktop";

export type VkPublicAnchorClickResult = "blocked" | "bridge" | "native";

type VkPublicAnchorView = {
  AndroidBridge?: unknown;
  webkit?: { messageHandlers?: { VKWebAppClose?: unknown } };
  ReactNativeWebView?: { postMessage?: unknown };
  location?: { search?: string };
};

export type VkPublicAnchorClickEnvironment = {
  client?: VkPublicAnchorClient;
  view?: VkPublicAnchorView | null;
  openDesktop?: (url: string) => boolean;
};

/**
 * Mobile VK keeps the real HTTPS anchor. Desktop may use VK Bridge, and
 * cancels the click only when that call accepts the navigation. A sync
 * failure leaves the anchor. Async bridge failure still falls back inside
 * openVkExternalHttps when the desktop path was the one that accepted.
 */
export function detectVkPublicAnchorClient(
  view: VkPublicAnchorView | null | undefined,
): VkPublicAnchorClient {
  if (!view) return "mobile";
  if (view.AndroidBridge) return "mobile";
  if (view.webkit?.messageHandlers?.VKWebAppClose) return "mobile";
  if (typeof view.ReactNativeWebView?.postMessage === "function") return "mobile";

  const platform = new URLSearchParams(view.location?.search ?? "").get("vk_platform") ?? "";
  if (platform.startsWith("desktop")) return "desktop";
  return "mobile";
}

/**
 * Shared VK public-link click. `allowed` is an exact allowlist check.
 * Mobile never calls the bridge and never cancels the native anchor.
 * Desktop cancels the click only after the existing external opener accepts.
 */
export function activateVkPublicAnchorClick(
  event: VkPublicAnchorClickEvent,
  url: string,
  allowed: (url: string) => boolean,
  environment?: VkPublicAnchorClickEnvironment,
): VkPublicAnchorClickResult {
  if (!allowed(url)) {
    event.preventDefault();
    return "blocked";
  }

  const client =
    environment?.client ??
    detectVkPublicAnchorClient(
      environment && "view" in environment
        ? environment.view
        : typeof window !== "undefined"
          ? (window as VkPublicAnchorView)
          : null,
    );

  if (client !== "desktop") {
    return "native";
  }

  const openDesktop = environment?.openDesktop ?? openVkGuestExternalUrl;
  if (!openDesktop(url)) {
    return "native";
  }

  event.preventDefault();
  return "bridge";
}

/** Footer web links only. Email stays a mailto anchor and must not use this. */
export function activateVkPublicFooterClick(
  event: VkPublicAnchorClickEvent,
  url: string,
  environment?: VkPublicAnchorClickEnvironment,
): VkPublicAnchorClickResult {
  return activateVkPublicAnchorClick(event, url, isVkPublicFooterUrl, environment);
}
