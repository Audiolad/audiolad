"use client";

import type { MouseEvent } from "react";

import {
  MINI_APP_BECOME_AUTHOR_ARIA_LABEL,
  MINI_APP_BECOME_AUTHOR_BANNER_SRC,
  miniAppAuthorsLandingUrl,
} from "@/lib/mini-app/home-public-links";
import { MEDITATION_AUTHORS_LANDING_PROMO_LINK } from "@/lib/seo/meditation-authors-landing";

const controlClassName =
  "pointer-events-auto relative z-[1] block w-full overflow-hidden rounded-[24px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

type MiniAppBecomeAuthorBannerProps = {
  onOpen?: (url: string) => void;
  /** VK home passes this so the banner is a real HTTPS link, not only a button callback. */
  anchorClick?: (event: MouseEvent<HTMLAnchorElement>, url: string) => void;
};

export default function MiniAppBecomeAuthorBanner({
  onOpen,
  anchorClick,
}: MiniAppBecomeAuthorBannerProps) {
  const url = miniAppAuthorsLandingUrl();
  if (!url) return null;

  const image = (
    <img
      src={MINI_APP_BECOME_AUTHOR_BANNER_SRC}
      alt=""
      draggable={false}
      className="pointer-events-none h-auto w-full max-w-full"
    />
  );

  return (
    <section
      className="pointer-events-auto relative z-[1] mt-8 w-full min-w-0 max-w-lg"
      aria-label={MINI_APP_BECOME_AUTHOR_ARIA_LABEL}
      data-mini-app-become-author-banner=""
    >
      {anchorClick ? (
        <a
          href={url}
          target={MEDITATION_AUTHORS_LANDING_PROMO_LINK.target}
          rel={MEDITATION_AUTHORS_LANDING_PROMO_LINK.rel}
          aria-label={MINI_APP_BECOME_AUTHOR_ARIA_LABEL}
          data-vk-authors-landing-anchor=""
          style={{ touchAction: "manipulation" }}
          className={controlClassName}
          onClick={(event) => {
            anchorClick(event, url);
          }}
        >
          {image}
        </a>
      ) : (
        <button
          type="button"
          aria-label={MINI_APP_BECOME_AUTHOR_ARIA_LABEL}
          onClick={() => onOpen?.(url)}
          className={controlClassName}
        >
          {image}
        </button>
      )}
    </section>
  );
}
