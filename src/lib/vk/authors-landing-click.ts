import {
  isMiniAppAuthorsLandingUrl,
  miniAppAuthorsLandingUrl,
} from "@/lib/mini-app/home-public-links";
import {
  activateVkPublicAnchorClick,
  detectVkPublicAnchorClient,
  type VkPublicAnchorClickEnvironment,
  type VkPublicAnchorClickEvent,
  type VkPublicAnchorClient,
} from "@/lib/vk/public-anchor-click";

export type VkAuthorsLandingClickEvent = VkPublicAnchorClickEvent;

export type VkAuthorsLandingClient = VkPublicAnchorClient;

export type VkAuthorsLandingClickEnvironment = VkPublicAnchorClickEnvironment;

/** @see detectVkPublicAnchorClient */
export function detectVkAuthorsLandingClient(
  view: Parameters<typeof detectVkPublicAnchorClient>[0],
): VkAuthorsLandingClient {
  return detectVkPublicAnchorClient(view);
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

/** Authors-landing allowlist over the shared VK public anchor contract. */
export function activateVkAuthorsLandingClick(
  event: VkAuthorsLandingClickEvent,
  url: string,
  environment?: VkAuthorsLandingClickEnvironment,
): "blocked" | "bridge" | "native" {
  return activateVkPublicAnchorClick(event, url, isMiniAppAuthorsLandingUrl, environment);
}
