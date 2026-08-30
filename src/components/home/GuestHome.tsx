import Link from "next/link";

import {
  GUEST_HOME_INTRO,
  GUEST_HOME_LISTEN_FREE_CTA,
} from "@/lib/home/guest-slider";
import type { HomeTopicItem } from "@/lib/home/topic-navigation";
import type { GuestHomeData } from "@/lib/home/types";

import BecomeAuthorPromoBanner from "@/components/listener/BecomeAuthorPromoBanner";

import AuthorsRail from "./AuthorsRail";
import GuestHomeSlider from "./GuestHomeSlider";
import HowItWorks from "./HowItWorks";
import HomeTopicNavigation from "./HomeTopicNavigation";
import ProductRail from "./ProductRail";
import SignUpInvitation from "./SignUpInvitation";

type GuestHomeProps = {
  data: GuestHomeData;
  homeTopics: HomeTopicItem[];
};

export default function GuestHome({ data, homeTopics }: GuestHomeProps) {
  return (
    <>
      <section className="mt-3 xl:mt-2">
        <p
          data-guest-home-intro
          className="text-[15px] font-medium leading-snug text-[#25135c] sm:text-base xl:text-[17px] xl:leading-6"
        >
          {GUEST_HOME_INTRO}
        </p>

        <div className="mt-3">
          <GuestHomeSlider />
        </div>

        <div className="mt-4 flex justify-center">
          <Link
            href={GUEST_HOME_LISTEN_FREE_CTA.href}
            data-guest-home-cta
            className="home-primary-cta home-primary-cta--compact"
          >
            {GUEST_HOME_LISTEN_FREE_CTA.label}
          </Link>
        </div>
      </section>

      <ProductRail
        title="Попробуйте в подарок"
        products={data.freeProducts}
        ariaLabel="Попробуйте в подарок"
        href="/catalog?access=free"
      />

      <HomeTopicNavigation topics={homeTopics} />

      <ProductRail
        title="Новое в АудиоЛаде"
        products={data.newProducts}
        ariaLabel="Новое в АудиоЛаде"
        href="/catalog?sort=new"
      />

      <ProductRail
        title="Аудиопрограммы"
        products={data.programProducts}
        ariaLabel="Аудиопрограммы"
        href="/catalog"
      />

      <AuthorsRail authors={data.authors} />

      <BecomeAuthorPromoBanner source="home_mobile" />

      <HowItWorks />

      <SignUpInvitation />
    </>
  );
}
