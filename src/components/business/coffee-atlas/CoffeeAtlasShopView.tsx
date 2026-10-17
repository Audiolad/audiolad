import Image from "next/image";
import Link from "next/link";

import {
  buildCoffeeAtlasShopPath,
  coffeeAtlasAsset,
  COFFEE_ATLAS_MUSIC_NOTE,
  COFFEE_ATLAS_PATH,
} from "@/lib/business/coffee-atlas/constants";
import type { CoffeeAtlasTrack } from "@/lib/business/coffee-atlas/music";
import { COFFEE_ATLAS_SHOPS, type CoffeeAtlasShop } from "@/lib/business/coffee-atlas/shops";

import {
  CoffeeAtlasCtaButton,
  CoffeeAtlasFooter,
  CoffeeAtlasHeader,
  CoffeeAtlasOffer,
} from "./CoffeeAtlasChrome";
import CoffeeAtlasGoalLink from "./CoffeeAtlasGoalLink";
import CoffeeAtlasListen from "./CoffeeAtlasListen";

type CoffeeAtlasShopViewProps = {
  shop: CoffeeAtlasShop;
  previous: CoffeeAtlasShop;
  next: CoffeeAtlasShop;
  tracks: CoffeeAtlasTrack[];
};

export default function CoffeeAtlasShopView({ shop, previous, next, tracks }: CoffeeAtlasShopViewProps) {
  const total = COFFEE_ATLAS_SHOPS.length;

  return (
    <div className="coffee-atlas" data-atlas-theme={shop.slug} data-atlas-page="shop">
      <CoffeeAtlasHeader currentSlug={shop.slug} />

      <main id="content">
        <section className="atlas-hero" aria-labelledby="atlas-shop-title">
          <div className="atlas-hero__media">
            <Image
              src={coffeeAtlasAsset(`${shop.slug}-hero.webp`)}
              alt={shop.heroAlt}
              fill
              sizes="100vw"
              priority
              className="atlas-hero__image"
            />
          </div>
          <div className="atlas-wrap atlas-hero__content">
            <div className="atlas-hero__copy">
              <p className="atlas-hero__stop">
                <span className="atlas-hero__badge">{shop.number}</span>
                Остановка {shop.number} из {total}
              </p>
              <h1 id="atlas-shop-title" className="atlas-display atlas-hero__title">
                {shop.name}
              </h1>
              <p className="atlas-hero__place">
                {shop.city}, {shop.country}
              </p>
              <p className="atlas-hero__tagline">{shop.tagline}</p>
              <div className="atlas-hero__actions">
                <a href="#listen" className="atlas-btn atlas-btn--primary">
                  Послушать атмосферу
                </a>
              </div>
            </div>
            <figure className="atlas-hero__postcard" aria-hidden="true">
              <Image
                src={coffeeAtlasAsset(`${shop.slug}-hero.webp`)}
                alt=""
                width={756}
                height={807}
                sizes="420px"
                priority
              />
              <figcaption>
                {shop.city} · {shop.number}/{total}
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="atlas-section" aria-labelledby="atlas-story-title">
          <div className="atlas-wrap">
            <p className="atlas-kicker">{shop.storyKicker}</p>
            <h2 id="atlas-story-title" className="atlas-display atlas-h2">
              {shop.storyTitle}
            </h2>
            <ul className="atlas-features">
              {shop.features.map((feature, index) => (
                <li key={feature.title} className="atlas-feature">
                  <span className="atlas-feature__index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="listen" className="atlas-section atlas-section--sound" aria-labelledby="atlas-sound-title">
          <div className="atlas-wrap atlas-sound">
            <div className="atlas-sound__copy">
              <p className="atlas-kicker">Звучание</p>
              <h2 id="atlas-sound-title" className="atlas-display atlas-h2">
                Как могла бы звучать эта кофейня?
              </h2>
              <p className="atlas-sound__idea">{shop.soundIdea}</p>
              <ul className="atlas-tags" aria-label="Характер звучания">
                {shop.soundTags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            </div>
            <div className="atlas-sound__player">
              <h3 className="atlas-sound__player-title">Послушать атмосферу</h3>
              <CoffeeAtlasListen shopName={shop.name} tracks={tracks} />
              <p className="atlas-sound__note">{COFFEE_ATLAS_MUSIC_NOTE}</p>
            </div>
          </div>
        </section>

        <section className="atlas-section" aria-labelledby="atlas-take-title">
          <div className="atlas-wrap">
            <p className="atlas-kicker">Идеи для вашей кофейни</p>
            <h2 id="atlas-take-title" className="atlas-display atlas-h2">
              Что можно взять себе?
            </h2>
            <ul className="atlas-takeaways">
              {shop.takeaways.map((item) => (
                <li key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </li>
              ))}
            </ul>
            <div className="atlas-inline-cta">
              <CoffeeAtlasCtaButton />
            </div>
          </div>
        </section>

        <section className="atlas-section atlas-section--slides" aria-labelledby="atlas-slides-title">
          <div className="atlas-wrap">
            <p className="atlas-kicker">
              Страницы {shop.pdfPage}–{shop.pdfPage + 2} атласа
            </p>
            <h2 id="atlas-slides-title" className="atlas-display atlas-h2">
              Из PDF-атласа
            </h2>
            <ul className="atlas-slides">
              {shop.slideAlts.map((alt, index) => (
                <li key={alt}>
                  <a
                    href={coffeeAtlasAsset(`${shop.slug}-${index + 1}.webp`)}
                    target="_blank"
                    rel="noopener"
                    className="atlas-slides__link"
                    aria-label={`${alt} Открыть крупно`}
                  >
                    <Image
                      src={coffeeAtlasAsset(`${shop.slug}-${index + 1}.webp`)}
                      alt={alt}
                      width={756}
                      height={1344}
                      sizes="(min-width: 960px) 300px, 70vw"
                      className="atlas-slide"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <nav className="atlas-section atlas-pager" aria-label="Соседние кофейни">
          <div className="atlas-wrap atlas-pager__grid">
            <CoffeeAtlasGoalLink
              href={buildCoffeeAtlasShopPath(previous.slug)}
              goal="business_atlas_shop_opened"
              className="atlas-pager__link atlas-pager__link--prev"
            >
              <span className="atlas-pager__dir">← Назад</span>
              <span className="atlas-pager__name">
                {previous.number}. {previous.name}
              </span>
              <span className="atlas-pager__place">{previous.city}</span>
            </CoffeeAtlasGoalLink>
            <Link href={COFFEE_ATLAS_PATH} className="atlas-pager__all">
              Все 10 кофеен
            </Link>
            <CoffeeAtlasGoalLink
              href={buildCoffeeAtlasShopPath(next.slug)}
              goal="business_atlas_shop_opened"
              className="atlas-pager__link atlas-pager__link--next"
            >
              <span className="atlas-pager__dir">Далее →</span>
              <span className="atlas-pager__name">
                {next.number}. {next.name}
              </span>
              <span className="atlas-pager__place">{next.city}</span>
            </CoffeeAtlasGoalLink>
          </div>
        </nav>

        <CoffeeAtlasOffer headingId="atlas-offer-title" />
      </main>

      <CoffeeAtlasFooter />
    </div>
  );
}
