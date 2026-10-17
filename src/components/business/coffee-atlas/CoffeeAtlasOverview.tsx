import Image from "next/image";

import {
  buildCoffeeAtlasShopPath,
  coffeeAtlasAsset,
  COFFEE_ATLAS_SUBTITLE,
  COFFEE_ATLAS_TITLE,
} from "@/lib/business/coffee-atlas/constants";
import { COFFEE_ATLAS_REASONS, COFFEE_ATLAS_SHOPS } from "@/lib/business/coffee-atlas/shops";

import {
  CoffeeAtlasCtaButton,
  CoffeeAtlasFooter,
  CoffeeAtlasHeader,
  CoffeeAtlasOffer,
} from "./CoffeeAtlasChrome";
import CoffeeAtlasGoalLink from "./CoffeeAtlasGoalLink";

export default function CoffeeAtlasOverview() {
  const first = COFFEE_ATLAS_SHOPS[0];

  return (
    <div className="coffee-atlas" data-atlas-theme="atlas" data-atlas-page="overview">
      <CoffeeAtlasHeader />

      <main id="content">
        <section className="atlas-cover" aria-labelledby="atlas-title">
          <div className="atlas-wrap atlas-cover__grid">
            <div className="atlas-cover__copy">
              <p className="atlas-kicker atlas-kicker--gold">Кофе · люди · города · вдохновение</p>
              <h1 id="atlas-title" className="atlas-display atlas-cover__title">
                {COFFEE_ATLAS_TITLE}
              </h1>
              <p className="atlas-cover__lead">{COFFEE_ATLAS_SUBTITLE}.</p>
              <p className="atlas-cover__question">Почему сюда возвращаются?</p>
              <div className="atlas-cover__actions">
                <CoffeeAtlasGoalLink
                  href={buildCoffeeAtlasShopPath(first.slug)}
                  goal="business_atlas_shop_opened"
                  className="atlas-btn atlas-btn--gold"
                >
                  Начать путешествие
                </CoffeeAtlasGoalLink>
              </div>
            </div>
            <figure className="atlas-cover__visual">
              <Image
                src={coffeeAtlasAsset("cover.webp")}
                alt="Обложка «Атлас кофеен мира»: карта мира, полароиды из Парижа, Нью-Йорка, Сиднея, Кейптауна и чашка капучино."
                width={756}
                height={1344}
                sizes="(min-width: 960px) 380px, 70vw"
                priority
                className="atlas-cover__image"
              />
            </figure>
          </div>
        </section>

        <section className="atlas-section" aria-labelledby="atlas-route-title">
          <div className="atlas-wrap">
            <p className="atlas-kicker">Маршрут</p>
            <h2 id="atlas-route-title" className="atlas-display atlas-h2">
              10 кофеен — 10 характеров звучания
            </h2>
            <p className="atlas-lead">
              Путешествие от венецианских залов XVIII века до кофейного театра Шанхая. В каждой
              кофейне — история, детали атмосферы, идеи, которые можно взять себе, и то, как она могла
              бы звучать.
            </p>
            <ul className="atlas-continents" aria-label="Города маршрута">
              {COFFEE_ATLAS_SHOPS.map((shop) => (
                <li key={shop.slug}>{shop.city}</li>
              ))}
            </ul>
            <ol className="atlas-route">
              {COFFEE_ATLAS_SHOPS.map((shop, index) => (
                <li key={shop.slug} className="atlas-stop" data-atlas-theme={shop.slug}>
                  <CoffeeAtlasGoalLink
                    href={buildCoffeeAtlasShopPath(shop.slug)}
                    goal="business_atlas_shop_opened"
                    className="atlas-stop__link"
                  >
                    <span className="atlas-stop__photo">
                      <Image
                        src={coffeeAtlasAsset(`${shop.slug}-hero.webp`)}
                        alt={shop.heroAlt}
                        width={756}
                        height={807}
                        sizes="(min-width: 1100px) 220px, (min-width: 640px) 45vw, 92vw"
                        loading={index < 2 ? "eager" : "lazy"}
                      />
                      <span className="atlas-stop__num">{shop.number}</span>
                    </span>
                    <span className="atlas-stop__body">
                      <span className="atlas-stop__place">
                        {shop.city}, {shop.country}
                      </span>
                      <span className="atlas-display atlas-stop__name">{shop.name}</span>
                      <span className="atlas-stop__sound">{shop.soundTags.join(" · ")}</span>
                    </span>
                  </CoffeeAtlasGoalLink>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="atlas-section atlas-section--dark" aria-labelledby="atlas-why-title">
          <div className="atlas-wrap atlas-why">
            <div>
              <p className="atlas-kicker atlas-kicker--gold">Атлас для владельцев кофеен со всего мира</p>
              <h2 id="atlas-why-title" className="atlas-display atlas-h2">
                Почему сюда возвращаются?
              </h2>
              <p className="atlas-lead">
                Потому что у каждой кофейни есть <em>свой характер</em>.
              </p>
              <ul className="atlas-reasons">
                {COFFEE_ATLAS_REASONS.map((reason) => (
                  <li key={reason.title}>
                    <h3>{reason.title}</h3>
                    <p>{reason.text}</p>
                  </li>
                ))}
              </ul>
              <div className="atlas-cover__actions">
                <CoffeeAtlasCtaButton className="atlas-btn atlas-btn--gold" />
              </div>
            </div>
            <figure className="atlas-why__visual">
              <Image
                src={coffeeAtlasAsset("finale.webp")}
                alt="Слайд атласа «Почему сюда возвращаются?»: карта мира с фотографиями кофеен и чашка кофе."
                width={756}
                height={1344}
                sizes="(min-width: 960px) 340px, 80vw"
                className="atlas-slide"
              />
            </figure>
          </div>
        </section>

        <CoffeeAtlasOffer headingId="atlas-offer-title" />
      </main>

      <CoffeeAtlasFooter />
    </div>
  );
}
