"use client";

import MiniAppBecomeAuthorBanner from "@/components/mini-app/MiniAppBecomeAuthorBanner";
import VkPublicFooter from "@/components/vk/VkPublicFooter";
import { isMiniAppAuthorsLandingUrl } from "@/lib/mini-app/home-public-links";
import { activateVkAuthorsLandingClick } from "@/lib/vk/authors-landing-click";
import { openVkGuestExternalUrl } from "@/lib/vk/guest-links";

export function openVkHomeAuthorsLanding(url: string): boolean {
  if (!isMiniAppAuthorsLandingUrl(url)) return false;
  return openVkGuestExternalUrl(url);
}

/** Banner, then canonical public footer. VK home is guest-only. */
export function VkHomeClosing() {
  return (
    <div data-mini-app-home-closing="vk">
      <MiniAppBecomeAuthorBanner anchorClick={activateVkAuthorsLandingClick} />
      <VkPublicFooter variant="home" />
    </div>
  );
}
