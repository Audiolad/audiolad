import Image from "next/image";

import { MEDITATION_SOLUTIONS_CARDS } from "@/lib/landings/25-meditation-solutions/content";

export default function MeditationSolutionsCards() {
  return (
    <section aria-label="Что входит">
      <ul
        data-catalog-product-grid
        data-meditation-solutions-grid
        className="catalog-product-grid catalog-product-grid--fixed-2"
      >
        {MEDITATION_SOLUTIONS_CARDS.map((card) => (
          <li key={card.id} className="flex min-w-0">
            <article
              data-meditation-solutions-card
              className="flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#eadff8] bg-white shadow-[0_6px_16px_rgba(91,62,145,0.06)]"
            >
              <div className="relative overflow-hidden bg-[#f4ecfb]">
                <div className="relative aspect-square w-full">
                  <Image
                    src={card.imageSrc}
                    alt={card.title}
                    fill
                    sizes="(max-width: 430px) 46vw, (max-width: 720px) 44vw, 340px"
                    className="object-cover"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="flex flex-1 flex-col px-2 pb-2 pt-1.5 xl:px-2 xl:pb-1.5 xl:pt-1.5">
                <h2 className="text-[14px] font-semibold leading-5 text-[#25135c] sm:text-[15px] sm:leading-5">
                  {card.title}
                </h2>
                <p className="mt-auto pt-1.5">
                  <span
                    data-meditation-solutions-format
                    className="inline-flex rounded-full bg-[#f7f2fc] px-2 py-0.5 text-[11px] font-medium leading-4 text-[#7d70a2]"
                  >
                    {card.format}
                  </span>
                </p>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
