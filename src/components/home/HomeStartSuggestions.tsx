import type { HomeProduct } from "@/lib/home/types";

import HomeProductCard from "./HomeProductCard";

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
    <section className="home-section-carousel mt-6" aria-label="С чего начнём">
      <h2 className="text-[22px] font-semibold leading-tight text-[#25135c]">
        С чего начнём?
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
        Выберите практику в подарок или откройте материал из каталога.
      </p>

      <div className="home-carousel-track catalog-carousel mt-4 flex gap-3 overflow-x-auto pb-1">
        {products.map((product) => (
          <div key={product.id} data-catalog-carousel-item>
            <HomeProductCard product={product} />
          </div>
        ))}
      </div>
    </section>
  );
}
