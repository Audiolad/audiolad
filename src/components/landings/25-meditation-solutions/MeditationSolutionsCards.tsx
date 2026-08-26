import Image from "next/image";

import {
  MEDITATION_SOLUTIONS_BONUS_BADGE,
  MEDITATION_SOLUTIONS_CARDS,
} from "@/lib/landings/25-meditation-solutions/content";

export default function MeditationSolutionsCards() {
  return (
    <section aria-label="Что входит">
      <ul
        data-catalog-product-grid
        data-meditation-solutions-grid
        className="catalog-product-grid catalog-product-grid--fixed-2"
      >
        {MEDITATION_SOLUTIONS_CARDS.map((card) => (
          <li key={card.id} className="min-w-0">
            <article
              data-meditation-solutions-card
              className="flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#eadff8] bg-white shadow-[0_6px_16px_rgba(91,62,145,0.06)]"
            >
              <div className="relative overflow-hidden bg-[#f4ecfb]">
                {card.bonus ? (
                  <span className="absolute left-2 top-2 z-10 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7042c5] shadow-[0_2px_8px_rgba(37,19,92,0.08)]">
                    {MEDITATION_SOLUTIONS_BONUS_BADGE}
                  </span>
                ) : null}
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
              <div className="flex flex-1 flex-col px-2.5 pb-2.5 pt-2">
                <h2 className="min-h-20 text-[14px] font-semibold leading-5 text-[#25135c] sm:text-[15px] sm:leading-5">
                  {card.title}
                </h2>
                <p className="mt-1.5">
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
