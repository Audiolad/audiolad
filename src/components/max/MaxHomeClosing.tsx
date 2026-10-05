"use client";

import MiniAppBecomeAuthorBanner from "@/components/mini-app/MiniAppBecomeAuthorBanner";
import MaxHomePublicFooter from "@/components/max/MaxHomePublicFooter";
import { openMaxExternalLink } from "@/lib/max/bridge";
import { isMiniAppAuthorsLandingUrl } from "@/lib/mini-app/home-public-links";

export function openMaxHomeAuthorsLanding(url: string): boolean {
  if (!isMiniAppAuthorsLandingUrl(url)) return false;
  return openMaxExternalLink(url);
}

/** Banner, then canonical public footer. Shown for guest and linked MAX home. */
export default function MaxHomeClosing() {
  return (
    <div data-mini-app-home-closing="max">
      <MiniAppBecomeAuthorBanner onOpen={openMaxHomeAuthorsLanding} />
      <MaxHomePublicFooter />
    </div>
  );
}
