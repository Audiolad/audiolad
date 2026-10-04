"use client";

import {
  MINI_APP_BECOME_AUTHOR_ARIA_LABEL,
  MINI_APP_BECOME_AUTHOR_BANNER_SRC,
  miniAppAuthorsLandingUrl,
} from "@/lib/mini-app/home-public-links";

type MiniAppBecomeAuthorBannerProps = {
  onOpen: (url: string) => void;
};

export default function MiniAppBecomeAuthorBanner({
  onOpen,
}: MiniAppBecomeAuthorBannerProps) {
  const url = miniAppAuthorsLandingUrl();
  if (!url) return null;

  return (
    <section
      className="mt-8 w-full min-w-0 max-w-lg"
      aria-label={MINI_APP_BECOME_AUTHOR_ARIA_LABEL}
      data-mini-app-become-author-banner=""
    >
      <button
        type="button"
        aria-label={MINI_APP_BECOME_AUTHOR_ARIA_LABEL}
        onClick={() => onOpen(url)}
        className="block w-full overflow-hidden rounded-[24px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <img
          src={MINI_APP_BECOME_AUTHOR_BANNER_SRC}
          alt=""
          className="h-auto w-full max-w-full"
        />
      </button>
    </section>
  );
}
