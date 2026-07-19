import Image from "next/image";
import Link from "next/link";

import { BECOME_AUTHOR_HREF } from "@/lib/profile/constants";

import becomeAuthorMobileBanner from "../../../public/images/banners/become-author-mobile-banner-v1.webp";

export type BecomeAuthorPromoSource =
  | "home_mobile"
  | "personal_home_mobile"
  | "personal_home_desktop"
  | "profile_mobile"
  | "catalog_mobile";

export type BecomeAuthorPromoVisibility = "mobile" | "desktop" | "all";

type BecomeAuthorPromoBannerProps = {
  source: BecomeAuthorPromoSource;
  visibility?: BecomeAuthorPromoVisibility;
  className?: string;
};

function getVisibilityClassName(
  visibility: BecomeAuthorPromoVisibility = "mobile",
): string {
  switch (visibility) {
    case "desktop":
      return "hidden xl:block";
    case "all":
      return "";
    case "mobile":
    default:
      return "xl:hidden";
  }
}

function getImageSizes(visibility: BecomeAuthorPromoVisibility = "mobile"): string {
  switch (visibility) {
    case "desktop":
      return "(min-width: 1280px) 720px, 100vw";
    case "all":
      return "(max-width: 1279px) calc(100vw - 2.5rem), 720px";
    case "mobile":
    default:
      return "(max-width: 430px) calc(100vw - 2.5rem), 390px";
  }
}

export default function BecomeAuthorPromoBanner({
  source,
  visibility = "mobile",
  className,
}: BecomeAuthorPromoBannerProps) {
  return (
    <section
      className={`mt-8 min-w-0 ${getVisibilityClassName(visibility)} ${className ?? ""}`}
      aria-label="Стать автором на АудиоЛад"
      data-promo-source={source}
    >
      <Link
        href={BECOME_AUTHOR_HREF}
        aria-label="Стать автором на АудиоЛад"
        className="block overflow-hidden rounded-[24px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] xl:max-w-[720px]"
      >
        <Image
          src={becomeAuthorMobileBanner}
          alt=""
          sizes={getImageSizes(visibility)}
          className="h-auto w-full max-w-full"
        />
      </Link>
    </section>
  );
}
