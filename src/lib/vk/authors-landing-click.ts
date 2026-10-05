import {
  isMiniAppAuthorsLandingUrl,
  miniAppAuthorsLandingUrl,
} from "@/lib/mini-app/home-public-links";
import { openVkGuestExternalUrl } from "@/lib/vk/guest-links";

export type VkAuthorsLandingClickEvent = {
  preventDefault: () => void;
};

export type VkAuthorsLandingClient = "mobile" | "desktop";

type VkAuthorsLandingView = {
  AndroidBridge?: unknown;
  webkit?: { messageHandlers?: { VKWebAppClose?: unknown } };
  ReactNativeWebView?: { postMessage?: unknown };
  location?: { search?: string };
};

export type VkAuthorsLandingClickEnvironment = {
  client?: VkAuthorsLandingClient;
  view?: VkAuthorsLandingView | null;
  openDesktop?: (url: string) => boolean;
};

/**
 * Mobile VK keeps the real HTTPS anchor. Desktop may use VK Bridge, and
 * cancels the click only when that call accepts the navigation. A sync
 * failure leaves the anchor. Async bridge failure still falls back inside
 * openVkExternalHttps when the desktop path was the one that accepted.
 */
export function detectVkAuthorsLandingClient(
  view: VkAuthorsLandingView | null | undefined,
): VkAuthorsLandingClient {
  if (!view) return "mobile";
  if (view.AndroidBridge) return "mobile";
  if (view.webkit?.messageHandlers?.VKWebAppClose) return "mobile";
  if (typeof view.ReactNativeWebView?.postMessage === "function") return "mobile";

  const platform = new URLSearchParams(view.location?.search ?? "").get("vk_platform") ?? "";
  if (platform.startsWith("desktop")) return "desktop";
  return "mobile";
}

/** VK guest slider: only slide 07 opens the canonical authors landing. */
export function vkGuestHomeSlideHref(slideId: string): string | null {
  if (slideId !== "07") return null;
  return miniAppAuthorsLandingUrl();
}

/**
 * Tap on VK slide 07. A non-canonical slide or URL is cancelled. Mobile
 * leaves the real https anchor. Desktop cancels the click only after the
 * bridge accepts the navigation.
 */
export function onVkGuestSlideAnchorClick(
  event: VkAuthorsLandingClickEvent,
  slideId: string,
  url: string,
  environment?: VkAuthorsLandingClickEnvironment,
): "blocked" | "bridge" | "native" {
  if (vkGuestHomeSlideHref(slideId) !== url) {
    event.preventDefault();
    return "blocked";
  }

  return activateVkAuthorsLandingClick(event, url, environment);
}

export function activateVkAuthorsLandingClick(
  event: VkAuthorsLandingClickEvent,
  url: string,
  environment?: VkAuthorsLandingClickEnvironment,
): "blocked" | "bridge" | "native" {
  if (!isMiniAppAuthorsLandingUrl(url)) {
    event.preventDefault();
    return "blocked";
  }

  const client =
    environment?.client ??
    detectVkAuthorsLandingClient(
      environment && "view" in environment
        ? environment.view
        : typeof window !== "undefined"
          ? (window as VkAuthorsLandingView)
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
