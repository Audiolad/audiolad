import Image from "next/image";
import Link from "next/link";

import {
  COFFEE_ATLAS_PATH,
  COFFEE_ATLAS_SUBTITLE,
  COFFEE_ATLAS_TITLE,
  coffeeAtlasAsset,
} from "@/lib/business/coffee-atlas/constants";

/** Dark atlas cover banner. The whole card is one internal link to the atlas. */
export default function GuideAtlasHeroBanner() {
  return (
    <div className="guide-wrap guide-block">
      <Link
        href={COFFEE_ATLAS_PATH}
        className="guide-atlas-hero"
        data-guide-banner="atlas-hero"
        target="_blank"
        rel="noopener"
      >
        <span className="guide-atlas-hero__text">
          <span className="guide-atlas-hero__kicker">Кофе · люди · города · вдохновение</span>
          <span className="guide-atlas-hero__title guide-display">{COFFEE_ATLAS_TITLE}</span>
          <span className="guide-atlas-hero__subtitle">{COFFEE_ATLAS_SUBTITLE}</span>
          <span className="guide-atlas-hero__question">Почему сюда возвращаются?</span>
          <span className="guide-atlas-hero__button">Открыть атлас</span>
        </span>
        <span className="guide-atlas-hero__cover">
          <Image
            src={coffeeAtlasAsset("cover.webp")}
            alt="Обложка «Атлас кофеен мира»: карта мира, полароиды из Парижа, Нью-Йорка, Сиднея, Кейптауна и чашка капучино."
            width={756}
            height={1344}
            sizes="(min-width: 800px) 220px, 40vw"
          />
        </span>
      </Link>
    </div>
  );
}
