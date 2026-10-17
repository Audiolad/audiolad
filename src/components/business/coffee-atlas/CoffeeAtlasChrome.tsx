import Link from "next/link";

import LegalLinksNav from "@/components/legal/LegalLinksNav";
import {
  buildCoffeeAtlasShopPath,
  COFFEE_ATLAS_CTA_HREF,
  COFFEE_ATLAS_CTA_LABEL,
  COFFEE_ATLAS_DISCLAIMER,
  COFFEE_ATLAS_OFFER,
  COFFEE_ATLAS_PATH,
  COFFEE_ATLAS_PDF_DOWNLOAD_NAME,
  COFFEE_ATLAS_PDF_PATH,
} from "@/lib/business/coffee-atlas/constants";
import { COFFEE_ATLAS_SHOPS } from "@/lib/business/coffee-atlas/shops";
import { BUSINESS_INQUIRY_EMAIL, BUSINESS_LANDING_PATH } from "@/lib/business/landing";

import CoffeeAtlasGoalLink from "./CoffeeAtlasGoalLink";
import CoffeeAtlasSwitcherFocus from "./CoffeeAtlasSwitcherFocus";

export function CoffeeAtlasHeader({ currentSlug }: { currentSlug?: string }) {
  return (
    <header className="atlas-header">
      <div className="atlas-wrap atlas-header__bar">
        <Link href={COFFEE_ATLAS_PATH} className="atlas-header__brand">
          <span className="atlas-header__mark" aria-hidden="true">
            ✦
          </span>
          <span>
            Атлас звучания
            <span className="atlas-header__brand-sub">АудиоЛад Бизнес</span>
          </span>
        </Link>
        <div className="atlas-header__actions">
          {/* The ONLY PDF control of the atlas (header). Page bodies have no PDF buttons:
              guests read and listen on the web; the PDF also arrives in the MAX mailing. */}
          <CoffeeAtlasGoalLink
            href={COFFEE_ATLAS_PDF_PATH}
            goal="business_atlas_pdf_downloaded"
            download={COFFEE_ATLAS_PDF_DOWNLOAD_NAME}
            className="atlas-header__pdf"
          >
            Скачать PDF-атлас
          </CoffeeAtlasGoalLink>
          <Link href={BUSINESS_LANDING_PATH} className="atlas-header__back">
            АудиоЛад Бизнес
          </Link>
        </div>
      </div>
      <nav className="atlas-switcher" aria-label="Кофейни атласа">
        <CoffeeAtlasSwitcherFocus currentSlug={currentSlug} />
        <ol className="atlas-wrap atlas-switcher__list">
          <li>
            <Link
              href={COFFEE_ATLAS_PATH}
              className="atlas-switcher__item atlas-switcher__item--all"
              aria-current={currentSlug ? undefined : "page"}
            >
              Все 10
            </Link>
          </li>
          {COFFEE_ATLAS_SHOPS.map((shop) => (
            <li key={shop.slug}>
              <CoffeeAtlasGoalLink
                href={buildCoffeeAtlasShopPath(shop.slug)}
                goal="business_atlas_shop_opened"
                className="atlas-switcher__item"
                ariaCurrent={currentSlug === shop.slug ? "page" : undefined}
              >
                <span className="atlas-switcher__num">{shop.number}</span>
                <span className="atlas-switcher__name">{shop.name}</span>
              </CoffeeAtlasGoalLink>
            </li>
          ))}
        </ol>
      </nav>
    </header>
  );
}

export function CoffeeAtlasCtaButton({ className = "atlas-btn atlas-btn--primary" }: { className?: string }) {
  return (
    <CoffeeAtlasGoalLink href={COFFEE_ATLAS_CTA_HREF} goal="business_atlas_cta_clicked" className={className}>
      {COFFEE_ATLAS_CTA_LABEL}
    </CoffeeAtlasGoalLink>
  );
}

/** AudioLad Business offer — printed at the bottom of every atlas page. */
export function CoffeeAtlasOffer({ headingId }: { headingId: string }) {
  return (
    <section className="atlas-offer" aria-labelledby={headingId} data-atlas-offer="true">
      <div className="atlas-wrap atlas-offer__card">
        <div className="atlas-offer__copy">
          <p className="atlas-kicker">Хотите послушать, как может звучать ваша кофейня?</p>
          <h2 id={headingId} className="atlas-offer__title">
            {COFFEE_ATLAS_OFFER.title}
          </h2>
          <ul className="atlas-offer__points">
            <li>
              <strong>{COFFEE_ATLAS_OFFER.price}</strong> {COFFEE_ATLAS_OFFER.period}
            </li>
            <li>{COFFEE_ATLAS_OFFER.trial}</li>
            <li>
              <Link href={COFFEE_ATLAS_OFFER.rightsHref}>{COFFEE_ATLAS_OFFER.rights}</Link>
            </li>
          </ul>
        </div>
        <div className="atlas-offer__action">
          <p className="atlas-offer__price" aria-hidden="true">
            {COFFEE_ATLAS_OFFER.price}
            <span>/ мес</span>
          </p>
          <CoffeeAtlasCtaButton className="atlas-btn atlas-btn--primary atlas-btn--wide" />
          <p className="atlas-offer__note">{COFFEE_ATLAS_OFFER.trial}</p>
        </div>
      </div>
    </section>
  );
}

export function CoffeeAtlasFooter() {
  return (
    <footer className="atlas-footer">
      <div className="atlas-wrap">
        <p className="atlas-footer__disclaimer">{COFFEE_ATLAS_DISCLAIMER}</p>
        <p className="atlas-footer__links">
          <Link href={BUSINESS_LANDING_PATH}>АудиоЛад Бизнес</Link>
          {" · "}
          <Link href="/">АудиоЛад</Link>
          {" · "}
          <a href={`mailto:${BUSINESS_INQUIRY_EMAIL}`}>{BUSINESS_INQUIRY_EMAIL}</a>
        </p>
        <LegalLinksNav />
      </div>
    </footer>
  );
}
