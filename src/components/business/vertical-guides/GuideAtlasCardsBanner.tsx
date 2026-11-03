import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import { COFFEE_ATLAS_PATH, coffeeAtlasAsset } from "@/lib/business/coffee-atlas/constants";
import { COFFEE_ATLAS_SHOPS } from "@/lib/business/coffee-atlas/shops";
import {
  ATLAS_CARD_NAMES_RU,
  ATLAS_CARD_THEMES,
  atlasSoundTagRu,
  DEFAULT_ATLAS_CARD_THEME,
} from "@/lib/business/vertical-guides/atlas-card-themes";

/**
 * «10 кофеен – 10 характеров звучания»: one internal link to the atlas that wraps
 * the city chips and ten shop cards. No nested links inside.
 * `neutral` (template v2, set 11 pilot): no brand names and no music tags in visible text or alt –
 * cards show only the place and no photos (shop photos carry signage); the single internal atlas link stays.
 */
export default function GuideAtlasCardsBanner({ neutral = false }: { neutral?: boolean }) {
  const cities = COFFEE_ATLAS_SHOPS.map((shop) => shop.city);
  return (
    <div className="guide-wrap guide-block">
      <Link
        href={COFFEE_ATLAS_PATH}
        className="guide-atlas-cards"
        data-guide-banner="atlas-cards"
        target="_blank"
        rel="noopener"
      >
        <span className="guide-atlas-cards__head">
          <span className="guide-atlas-cards__title guide-display">
            {neutral ? "10 кофеен – 10 городов мира" : "10 кофеен – 10 характеров звучания"}
          </span>
          <span className="guide-atlas-cards__subtitle">
            {neutral
              ? "Десять городов на пяти континентах: история каждой кофейни и детали, которые можно взять себе."
              : "Десять городов на пяти континентах: история каждой кофейни, детали, которые можно взять себе, и идея её звучания."}
          </span>
          <span className="guide-atlas-cards__chips" aria-hidden="true">
            {cities.map((city) => (
              <span key={city} className="guide-atlas-cards__chip">
                {city}
              </span>
            ))}
          </span>
        </span>
        <span className="guide-atlas-cards__grid">
          {COFFEE_ATLAS_SHOPS.map((shop) => {
            const theme = ATLAS_CARD_THEMES[shop.slug] ?? DEFAULT_ATLAS_CARD_THEME;
            const style = {
              "--card-surface": theme.surface,
              "--card-ink": theme.ink,
              "--card-muted": theme.muted,
              "--card-accent": theme.accent,
              "--card-accent-ink": theme.accentInk,
            } as CSSProperties;
            const name = neutral ? `Кофейня №${shop.number}` : (ATLAS_CARD_NAMES_RU[shop.slug] ?? shop.name);
            return (
              <span key={shop.slug} className={neutral ? "guide-atlas-card guide-atlas-card--text" : "guide-atlas-card"} style={style} data-atlas-card={shop.slug}>
                {neutral ? null : (
                  <span className="guide-atlas-card__media">
                    <Image
                      src={coffeeAtlasAsset(`${shop.slug}-hero.webp`)}
                      alt={`${name}, ${shop.city} – обложка карточки атласа`}
                      width={756}
                      height={807}
                      sizes="(min-width: 960px) 190px, (min-width: 600px) 30vw, 45vw"
                    />
                    <span className="guide-atlas-card__number" aria-hidden="true">
                      {shop.number}
                    </span>
                  </span>
                )}
                <span className="guide-atlas-card__body">
                  <span className="guide-atlas-card__place">
                    {shop.city}, {shop.country}
                  </span>
                  <span className="guide-atlas-card__name">{name}</span>
                  {neutral ? null : (
                    <span className="guide-atlas-card__tags">{shop.soundTags.map(atlasSoundTagRu).join(" · ")}</span>
                  )}
                </span>
              </span>
            );
          })}
        </span>
        <span className="guide-atlas-cards__button">Смотреть все 10 кофеен</span>
      </Link>
    </div>
  );
}
