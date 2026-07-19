import Image from "next/image";
import Link from "next/link";

import { BECOME_AUTHOR_HREF } from "@/lib/profile/constants";

import becomeAuthorMobileBanner from "../../../public/images/banners/become-author-mobile-banner-v1.webp";

export type BecomeAuthorPromoSource =
  | "home_mobile"
  | "profile_mobile"
  | "catalog_mobile";

type BecomeAuthorPromoBannerProps = {
  source: BecomeAuthorPromoSource;
  className?: string;
};

export default function BecomeAuthorPromoBanner({
  source,
  className,
}: BecomeAuthorPromoBannerProps) {
  return (
    <section
      className={`mt-8 min-w-0 xl:hidden ${className ?? ""}`}
      aria-label="Стать автором на АудиоЛад"
      data-promo-source={source}
    >
      <Link
        href={BECOME_AUTHOR_HREF}
        aria-label="Стать автором на АудиоЛад"
        className="block overflow-hidden rounded-[24px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <Image
          src={becomeAuthorMobileBanner}
          alt=""
          sizes="(max-width: 430px) calc(100vw - 2.5rem), 390px"
          className="h-auto w-full max-w-full"
        />
      </Link>
    </section>
  );
}
