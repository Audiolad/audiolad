import Link from "next/link";

import type { GuestHomeData } from "@/lib/home/types";

import AuthorsRail from "./AuthorsRail";
import HeroFeaturedProduct from "./HeroFeaturedProduct";
import { PlayIcon } from "./HomeIcons";
import HowItWorks from "./HowItWorks";
import NeedsNavigation from "./NeedsNavigation";
import ProductRail from "./ProductRail";
import SignUpInvitation from "./SignUpInvitation";

type GuestHomeProps = {
  data: GuestHomeData;
};

function getPrimaryListenHref(data: GuestHomeData): string {
  if (data.featuredFreeProduct?.listenHref) {
    return data.featuredFreeProduct.listenHref;
  }

  const firstFree = data.freeProducts[0];

  if (firstFree?.listenHref) {
    return firstFree.listenHref;
  }

  return "/catalog";
}

export default function GuestHome({ data }: GuestHomeProps) {
  const primaryListenHref = getPrimaryListenHref(data);

  return (
    <>
      <section className="mt-8 xl:mt-5">
        <h1 className="text-[32px] font-semibold leading-tight text-[#25135c] lg:text-[42px] lg:leading-[1.15] xl:text-[34px] xl:leading-[1.12]">
          Аудио, которое помогает вернуться к себе
        </h1>

        <p className="mt-3 max-w-[720px] text-lg font-medium leading-7 text-[#7042c5] lg:text-xl xl:max-w-none xl:text-[17px] xl:leading-7">
          Авторские аудиопрактики, медитации, лекции, подкасты и программы в
          одном спокойном пространстве.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={primaryListenHref}
            className="home-primary-cta home-primary-cta--hero"
          >
            <PlayIcon />
            Начать слушать
          </Link>

          <Link
            href="/catalog"
            className="inline-flex min-h-11 items-center rounded-[22px] border border-[#c9b5e8] bg-white px-5 py-3.5 text-[16px] font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Открыть каталог
          </Link>
        </div>
      </section>

      {data.featuredFreeProduct ? (
        <HeroFeaturedProduct product={data.featuredFreeProduct} />
      ) : null}

      <ProductRail
        title="Попробуйте в подарок"
        products={data.freeProducts}
        ariaLabel="Попробуйте в подарок"
        href="/catalog"
      />

      <NeedsNavigation />

      <ProductRail
        title="Новое в АудиоЛаде"
        products={data.newProducts}
        ariaLabel="Новое в АудиоЛаде"
        href="/catalog"
      />

      <ProductRail
        title="Аудиопрограммы"
        products={data.programProducts}
        ariaLabel="Аудиопрограммы"
        href="/catalog"
      />

      <AuthorsRail authors={data.authors} />

      <HowItWorks />

      <SignUpInvitation />
    </>
  );
}
