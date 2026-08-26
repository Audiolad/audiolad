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
            <article className="min-w-0">
              <div className="relative overflow-hidden rounded-[18px] bg-[#efe6fb] shadow-[0_8px_20px_rgba(37,19,92,0.06)]">
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
              <h2 className="mt-2 text-[14px] font-semibold leading-5 text-[#25135c] sm:text-[15px]">
                {card.title}
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-[#5f5484]">
                {card.description}
              </p>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
