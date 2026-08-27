import type { ReactNode } from "react";

export const FEATURED_CARD_SHELL_CLASS =
  "featured-card featured-card--guest overflow-hidden rounded-[28px]";

export const FEATURED_CARD_CHIP_CLASS =
  "inline-flex rounded-full bg-[#f4ecfb] px-3 py-1 text-xs font-medium text-[#7042c5]";

export const FEATURED_CARD_TITLE_CLASS =
  "mt-3 text-[22px] font-semibold leading-tight text-[#25135c]";

export const FEATURED_CARD_SUBTITLE_CLASS =
  "mt-2 text-sm font-medium text-[#7042c5]";

export const FEATURED_CARD_META_CLASS = "mt-2 text-sm text-[#7d70a2]";

export const FEATURED_CARD_ACTIONS_CLASS = "mt-4 flex flex-wrap gap-3";

export const FEATURED_CARD_PRIMARY_CTA_CLASS =
  "inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

export const FEATURED_CARD_SECONDARY_CTA_CLASS =
  "inline-flex min-h-11 items-center rounded-2xl border border-[#7042c5] bg-white px-5 py-3 text-sm font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

type FeaturedProductCardProps = {
  cover: ReactNode;
  children: ReactNode;
  className?: string;
  "data-practice-product-hero"?: string;
  "data-practice-hero-has-gallery"?: string;
  "data-practice-hero-has-promo"?: string;
};

export default function FeaturedProductCard({
  cover,
  children,
  className = "",
  ...dataAttributes
}: FeaturedProductCardProps) {
  return (
    <article
      data-featured-product-card=""
      className={`${FEATURED_CARD_SHELL_CLASS} ${className}`.trim()}
      {...dataAttributes}
    >
      {cover}
      <div className="featured-card__content">{children}</div>
    </article>
  );
}
