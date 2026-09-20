import type { HomeProduct } from "@/lib/home/types";

import HomeProductCarouselTrack from "./HomeProductCarouselTrack";
import HomeSectionHeader from "./HomeSectionHeader";

type HomeStartSuggestionsProps = {
  products: HomeProduct[];
};

export default function HomeStartSuggestions({
  products,
}: HomeStartSuggestionsProps) {
  if (products.length === 0) {
    return null;
  }

  return (
    <section className="home-section-carousel mt-6 xl:mt-7" aria-label="С чего начнём">
      <HomeSectionHeader title="С чего начнём?" />
      <p className="mt-2 text-sm leading-6 text-[#7d70a2] xl:mt-2.5 xl:text-[15px] xl:leading-[1.45]">
        Выберите практику в подарок или откройте материал из каталога.
      </p>

      <HomeProductCarouselTrack
        products={products}
        prevAriaLabel="Предыдущие подсказки «С чего начнём»"
        nextAriaLabel="Следующие подсказки «С чего начнём»"
      />
    </section>
  );
}
