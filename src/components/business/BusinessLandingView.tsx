import Image from "next/image";
import Link from "next/link";

import BusinessInquiryForm from "@/components/business/BusinessInquiryForm";
import BusinessListenRail from "@/components/business/BusinessListenRail";
import BusinessSnapCarousel from "@/components/business/BusinessSnapCarousel";
import BusinessSocialProofSlot from "@/components/business/BusinessSocialProofSlot";
import LegalLinksNav from "@/components/legal/LegalLinksNav";
import {
  BUSINESS_ATMOSPHERES,
  BUSINESS_BENEFITS,
  BUSINESS_CLOSER,
  BUSINESS_CONTROL_ACTIONS,
  BUSINESS_CONTROL_LEAD,
  BUSINESS_CONTROL_TITLE,
  BUSINESS_DAYPART_LEAD,
  BUSINESS_DAYPART_TITLE,
  BUSINESS_DAYPARTS,
  BUSINESS_FAQ,
  BUSINESS_FORMATS,
  BUSINESS_HERO_MICRO,
  BUSINESS_HOW_HELP,
  BUSINESS_HOW_LABEL,
  BUSINESS_HOW_NOTE,
  BUSINESS_INQUIRY_EMAIL,
  BUSINESS_LANDING_H1,
  BUSINESS_LANDING_SUBCOPY,
  BUSINESS_LEGAL_LEAD,
  BUSINESS_LEGAL_QUOTE_CARDS_ENABLED,
  BUSINESS_LISTEN_LABEL,
  BUSINESS_LISTEN_LEAD,
  BUSINESS_LOCATION_PREVIEW,
  BUSINESS_NETWORK_LEAD,
  BUSINESS_NETWORK_TITLE,
  BUSINESS_OFFLINE_LEAD,
  BUSINESS_OFFLINE_TITLE,
  BUSINESS_PICK_LABEL,
  BUSINESS_PRICE_ROWS,
  BUSINESS_PRICE_TITLE,
  BUSINESS_RELIEF,
  BUSINESS_RELIEF_CLOSER,
  BUSINESS_RELIEF_HEADING,
  BUSINESS_ROLES,
  BUSINESS_SEO_ARTICLES,
  BUSINESS_SOURCES,
  BUSINESS_SOURCES_NOTE,
  BUSINESS_STAFF_LEAD,
  BUSINESS_STAFF_TITLE,
  BUSINESS_STEPS,
  BUSINESS_SUPPORT_LEAD,
  BUSINESS_SUPPORT_NOTE,
  BUSINESS_SUPPORT_TITLE,
  BUSINESS_TRIAL_CARD,
  BUSINESS_TRIAL_FREE,
  BUSINESS_UNIFYING,
  BUSINESS_VARIETY_BODY,
  BUSINESS_VARIETY_LEAD,
  BUSINESS_VARIETY_TITLE,
  BUSINESS_VENUES,
  buildBusinessSeoArticlePath,
  businessAssetPath,
} from "@/lib/business/landing";
import type { BusinessListenExample } from "@/lib/business/listen-selection";

import "./business-landing.css";

type BusinessLandingViewProps = {
  listenExamples: BusinessListenExample[];
};

function Poster({
  file,
  alt,
  width,
  height,
  sizes,
  priority = false,
  eager = false,
  className = "business-poster",
}: {
  file: Parameters<typeof businessAssetPath>[0];
  alt: string;
  width: number;
  height: number;
  sizes: string;
  priority?: boolean;
  eager?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={businessAssetPath(file)}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      priority={priority}
      loading={priority || eager ? "eager" : "lazy"}
      className={className}
    />
  );
}

export default function BusinessLandingView({
  listenExamples,
}: BusinessLandingViewProps) {
  return (
    <div className="business-landing" data-business-page="true">
      <a className="business-skip" href="#content">
        К содержанию
      </a>
      <header className="business-header">
        <div className="business-header__bar">
          <Link href="/b" className="business-wordmark">
            Аудиолад Бизнес
          </Link>
          <nav className="business-header__nav" aria-label="Разделы страницы">
            <a href="#how">{BUSINESS_HOW_LABEL}</a>
            <a href="#listen">Послушать</a>
            <a href="#rights">Условия</a>
            <a href="#connect">Подключить</a>
          </nav>
          <div className="business-header__cta">
            <a className="business-btn business-btn--primary" href="#venues">
              {BUSINESS_PICK_LABEL}
            </a>
          </div>
        </div>
      </header>

      <main id="content" className="business-main">
        <section className="business-section business-section--tight" aria-labelledby="business-hero-title">
          <div className="business-wrap business-hero">
            <div>
              <p className="business-kicker">Аудиолад Бизнес</p>
              <h1 id="business-hero-title" className="business-h1">
                {BUSINESS_LANDING_H1}
              </h1>
              <p className="business-lead">{BUSINESS_LANDING_SUBCOPY}</p>
              <p className="business-micro">{BUSINESS_HERO_MICRO}</p>
              <div className="business-actions">
                <a className="business-btn business-btn--primary" href="#venues">
                  {BUSINESS_PICK_LABEL}
                </a>
                <a className="business-btn business-btn--secondary" href="#listen">
                  {BUSINESS_LISTEN_LABEL}
                </a>
              </div>
            </div>
            <Poster
              file="01-business-music.webp"
              alt=""
              width={1254}
              height={1254}
              sizes="(min-width: 1100px) 46vw, 100vw"
              priority
            />
          </div>
        </section>

        <section className="business-section" aria-labelledby="business-benefits-title">
          <div className="business-wrap">
            <h2 id="business-benefits-title" className="sr-only">
              Что получает ваш бизнес
            </h2>
            <ul className="business-card-grid business-card-grid--benefits">
              {BUSINESS_BENEFITS.map((benefit) => (
                <li key={benefit.id} className="business-card">
                  <h3>{benefit.title}</h3>
                  <p>{benefit.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="business-section business-section--statement" aria-labelledby="business-unifying-title">
          <div className="business-wrap">
            <h2 id="business-unifying-title" className="business-h2 business-statement">
              {BUSINESS_UNIFYING}
            </h2>
            <p className="business-lead">{BUSINESS_CLOSER}</p>
          </div>
        </section>

        <section className="business-section" id="relief" aria-labelledby="business-relief-title">
          <div className="business-wrap">
            <h2 id="business-relief-title" className="business-h2">
              {BUSINESS_RELIEF_HEADING}
            </h2>
            <ul className="business-relief">
              {BUSINESS_RELIEF.map((item) => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ul>
            <p className="business-copy">{BUSINESS_RELIEF_CLOSER}</p>
          </div>
        </section>

        <section className="business-section" id="how" aria-labelledby="business-how-title">
          <div className="business-wrap">
            <h2 id="business-how-title" className="business-h2">
              {BUSINESS_HOW_LABEL}
            </h2>
            <div className="business-split business-split--compose">
              <Poster
                file="10-how-it-works.webp"
                alt=""
                width={1254}
                height={1254}
                sizes="(min-width: 1100px) 46vw, 100vw"
              />
              <ol className="business-steps">
                {BUSINESS_STEPS.map((step, index) => (
                  <li key={step.id} className="business-step">
                    <span className="business-step__index">{index + 1}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <p className="business-copy">{BUSINESS_HOW_NOTE}</p>
            <p className="business-copy">
              <a href="#support">{BUSINESS_HOW_HELP}</a>
            </p>
            <div className="business-actions">
              <a className="business-btn business-btn--primary" href="#listen">
                {BUSINESS_LISTEN_LABEL}
              </a>
            </div>
          </div>
        </section>

        <section className="business-section" id="venues" aria-labelledby="business-venues-title">
          <div className="business-wrap">
            <h2 id="business-venues-title" className="business-h2">
              Где звучит наша музыка
            </h2>
            <p className="business-lead">
              Музыка для кафе, салонов, клиник, магазинов, отелей и офисов.
            </p>
            <BusinessSnapCarousel
              ariaLabel="Где звучит наша музыка"
              prevLabel="Предыдущие пространства"
              nextLabel="Следующие пространства"
            >
              {BUSINESS_VENUES.map((venue) => (
                <article
                  key={venue.id}
                  className="business-snap__item business-venue"
                  data-business-snap-item
                  data-business-venue={venue.id}
                  aria-label={venue.name}
                >
                  <Poster
                    file={venue.file}
                    alt=""
                    width={1254}
                    height={1254}
                    sizes="(min-width: 1100px) 42vw, 88vw"
                  />
                  <p className="sr-only">{venue.name}</p>
                </article>
              ))}
            </BusinessSnapCarousel>
          </div>
        </section>

        <section className="business-section" id="listen" aria-labelledby="business-listen-title">
          <div className="business-wrap">
            <h2 id="business-listen-title" className="business-h2">
              Как звучит ваш бизнес?
            </h2>
            <p className="business-lead">{BUSINESS_LISTEN_LEAD}</p>
            <fieldset className="business-fieldset">
              <legend className="business-kicker">Ваш бизнес</legend>
              <div className="business-chips">
                {BUSINESS_FORMATS.map((format, index) => (
                  <label key={format.id} className="business-chip">
                    <input
                      type="radio"
                      name="business-format"
                      defaultChecked={index === 0}
                    />
                    <span>{format.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="business-fieldset">
              <legend className="business-kicker">Атмосфера</legend>
              <div className="business-chips">
                {BUSINESS_ATMOSPHERES.map((atmosphere, index) => (
                  <label key={atmosphere} className="business-chip">
                    <input
                      type="radio"
                      name="business-atmosphere"
                      defaultChecked={index === 0}
                    />
                    <span>{atmosphere}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="business-actions">
              <a className="business-btn business-btn--primary" href="#listen-now">
                {BUSINESS_LISTEN_LABEL}
              </a>
            </div>
            <div className="mt-6" id="listen-now">
              <BusinessListenRail items={listenExamples} />
            </div>
          </div>
        </section>

        <section className="business-section" id="variety" aria-labelledby="business-variety-title">
          <div className="business-wrap">
            <h2 id="business-variety-title" className="business-h2">
              {BUSINESS_VARIETY_TITLE}
            </h2>
            <p className="business-lead">{BUSINESS_VARIETY_LEAD}</p>
            <p className="business-copy">{BUSINESS_VARIETY_BODY}</p>
          </div>
        </section>

        <section className="business-section" id="control" aria-labelledby="business-control-title">
          <div className="business-wrap">
            <h2 id="business-control-title" className="business-h2">
              {BUSINESS_CONTROL_TITLE}
            </h2>
            <p className="business-lead">{BUSINESS_CONTROL_LEAD}</p>
            <div className="business-mood">
              <span>Спокойнее</span>
              <input
                type="range"
                min={0}
                max={2}
                defaultValue={1}
                aria-label="Спокойнее или энергичнее"
              />
              <span>Энергичнее</span>
            </div>
            <div className="business-chips" role="group" aria-label="Реакция на музыку">
              {BUSINESS_CONTROL_ACTIONS.map((action) => (
                <label key={action} className="business-chip">
                  <input type="checkbox" name="business-reaction" value={action} />
                  <span>{action}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="business-section" id="dayparts" aria-labelledby="business-dayparts-title">
          <div className="business-wrap">
            <h2 id="business-dayparts-title" className="business-h2">
              {BUSINESS_DAYPART_TITLE}
            </h2>
            <p className="business-lead">{BUSINESS_DAYPART_LEAD}</p>
            <ul className="business-card-grid business-dayparts">
              {BUSINESS_DAYPARTS.map((part) => (
                <li key={part.id} className="business-card">
                  <h3>{part.title}</h3>
                  <p>{part.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="business-section" id="offline" aria-labelledby="business-offline-title">
          <div className="business-wrap">
            <h2 id="business-offline-title" className="business-h2">
              {BUSINESS_OFFLINE_TITLE}
            </h2>
            <p className="business-lead">{BUSINESS_OFFLINE_LEAD}</p>
          </div>
        </section>

        <section className="business-section" id="rights" aria-labelledby="business-rights-title">
          <div className="business-wrap business-split business-split--half">
            <Poster
              file="11-rights-documents.webp"
              alt=""
              width={1254}
              height={1254}
              sizes="(min-width: 1100px) 46vw, 100vw"
            />
            <div>
              <h2 id="business-rights-title" className="business-h2">
                Спокойно с юридической стороны
              </h2>
              <p className="business-lead">{BUSINESS_LEGAL_LEAD}</p>
              <ul className="business-source-list">
                <li>
                  <Link className="business-source-link" href="/offer">
                    Публичная оферта
                  </Link>
                </li>
                <li>
                  <Link className="business-source-link" href="/privacy">
                    Политика обработки персональных данных
                  </Link>
                </li>
                <li>
                  <Link className="business-source-link" href="/payment-and-refund">
                    Оплата, получение и возврат
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="business-section" aria-labelledby="business-banner-title">
          <div className="business-wrap">
            <h2 id="business-banner-title" className="sr-only">
              Работаем в соответствии с законом
            </h2>
            <Poster
              file="14-legal-music-banner.webp"
              alt="Иллюстрация: легальная музыка и опора на публичные источники."
              width={1676}
              height={939}
              sizes="(min-width: 1280px) 1320px, 100vw"
              eager
              className="business-banner"
            />
          </div>
        </section>

        <section className="business-section business-section--sources" aria-labelledby="business-sources-title">
          <div className="business-wrap business-sources">
            <h2 id="business-sources-title" className="business-h2">
              Публичные источники
            </h2>
            <p className="business-lead">{BUSINESS_SOURCES_NOTE}</p>
            <div className="business-sources-frame">
              <Poster
                file="15-authoritative-sources.webp"
                alt="Гражданский кодекс РФ, Роспатент, Верховный суд, РАО, Коммерсантъ и РБК."
                width={2172}
                height={724}
                sizes="(min-width: 1280px) 1320px, 100vw"
                eager
                className="business-poster business-sources-composite"
              />
            </div>
            <div className="business-logo-scroll" aria-label="Логотипы источников">
              {BUSINESS_SOURCES.map((source) => {
                const image = (
                  <Poster
                    file={source.logo}
                    alt={source.name}
                    width={1536}
                    height={1024}
                    sizes="240px"
                    className="business-logo-img"
                  />
                );

                if (!source.href) {
                  return (
                    <div key={source.id} className="business-logo-card">
                      {image}
                    </div>
                  );
                }

                return (
                  <a
                    key={source.id}
                    className="business-logo-card"
                    href={source.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={source.linkLabel}
                  >
                    {image}
                  </a>
                );
              })}
            </div>
            <ul className="business-source-list">
              {BUSINESS_SOURCES.filter((source) => source.href).map((source) => (
                <li key={source.id}>
                  <a
                    className="business-source-link"
                    href={source.href ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.linkLabel}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {BUSINESS_LEGAL_QUOTE_CARDS_ENABLED ? (
          <section aria-label="Юридические карточки" data-business-legal-quotes="on" />
        ) : null}

        {BUSINESS_SEO_ARTICLES.length > 0 ? (
          <section className="business-section" aria-labelledby="business-seo-title">
            <div className="business-wrap">
              <h2 id="business-seo-title" className="business-h2">
                Материалы
              </h2>
              <ul className="business-card-grid">
                {BUSINESS_SEO_ARTICLES.map((article) => (
                  <li key={article.slug} className="business-card">
                    <h3>
                      <Link href={buildBusinessSeoArticlePath(article.slug)}>
                        {article.title}
                      </Link>
                    </h3>
                    <p>{article.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <section className="business-section" id="staff" aria-labelledby="business-staff-title">
          <div className="business-wrap">
            <h2 id="business-staff-title" className="business-h2">
              {BUSINESS_STAFF_TITLE}
            </h2>
            <p className="business-lead">{BUSINESS_STAFF_LEAD}</p>
            <ul className="business-card-grid business-roles">
              {BUSINESS_ROLES.map((role) => (
                <li key={role.id} className="business-card">
                  <h3>{role.title}</h3>
                  <p>{role.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="business-section" id="network" aria-labelledby="business-network-title">
          <div className="business-wrap">
            <h2 id="business-network-title" className="business-h2">
              {BUSINESS_NETWORK_TITLE}
            </h2>
            <p className="business-lead">{BUSINESS_NETWORK_LEAD}</p>
            <ul className="business-points" aria-label="Точки в кабинете">
              {BUSINESS_LOCATION_PREVIEW.map((point) => (
                <li key={point.id} className="business-point">
                  <span
                    className={
                      point.status === "playing"
                        ? "business-point__dot"
                        : "business-point__dot business-point__dot--offline"
                    }
                    aria-hidden="true"
                  />
                  <span>
                    <strong>{point.name}</strong>
                    <span className="business-point__now">{point.now}</span>
                  </span>
                  <span className="business-point__status">
                    {point.status === "playing" ? "Музыка играет" : "Offline"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="business-section" id="support" aria-labelledby="business-support-title">
          <div className="business-wrap">
            <h2 id="business-support-title" className="business-h2">
              {BUSINESS_SUPPORT_TITLE}
            </h2>
            <p className="business-lead">{BUSINESS_SUPPORT_LEAD}</p>
            <p className="business-copy">{BUSINESS_SUPPORT_NOTE}</p>
            <div className="business-actions">
              <Link className="business-btn business-btn--secondary" href="/help/support">
                Написать в поддержку
              </Link>
            </div>
          </div>
        </section>

        <section className="business-section" id="trial" aria-labelledby="business-trial-title">
          <div className="business-wrap business-split business-split--half">
            <div>
              <h2 id="business-trial-title" className="business-h2">
                {BUSINESS_TRIAL_FREE}
              </h2>
              <p className="business-lead">{BUSINESS_TRIAL_CARD}</p>
              <p className="business-copy">
                Сначала слушаете музыку, затем пользуетесь периодом и подключаете оплату, когда она нужна.
              </p>
              <div className="business-actions">
                <a className="business-btn business-btn--primary" href="#listen">
                  {BUSINESS_TRIAL_FREE}
                </a>
                <a className="business-btn business-btn--secondary" href="#venues">
                  {BUSINESS_TRIAL_CARD}
                </a>
              </div>
            </div>
            <Poster
              file="12-free-trial.webp"
              alt=""
              width={1254}
              height={1254}
              sizes="(min-width: 1100px) 46vw, 100vw"
            />
          </div>
        </section>

        <section className="business-section" id="price" aria-labelledby="business-price-title">
          <div className="business-wrap">
            <h2 id="business-price-title" className="business-h2">
              {BUSINESS_PRICE_TITLE}
            </h2>
            <dl className="business-price">
              {BUSINESS_PRICE_ROWS.map((row) => (
                <div key={row.id}>
                  <dt>{row.title}</dt>
                  <dd>{row.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="business-section" id="connect" aria-labelledby="business-connect-title">
          <div className="business-wrap">
            <h2 id="business-connect-title" className="business-h2">
              Нужна помощь с подключением?
            </h2>
            <p className="business-lead">
              Напишите, если хотите помощь со стартом или сетью. Это по вашей просьбе.
            </p>
            <div className="business-inquiry">
              <BusinessInquiryForm />
            </div>
          </div>
        </section>

        <section className="business-section" id="faq" aria-labelledby="business-faq-title">
          <div className="business-wrap">
            <h2 id="business-faq-title" className="business-h2">
              Вопросы
            </h2>
            <div className="business-faq">
              {BUSINESS_FAQ.map((item) => (
                <details key={item.id}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <BusinessSocialProofSlot />

        <section className="business-section" aria-labelledby="business-final-title">
          <div className="business-wrap business-split business-split--half">
            <Poster
              file="13-handshake-agreement.webp"
              alt=""
              width={1312}
              height={1199}
              sizes="(min-width: 1100px) 46vw, 100vw"
            />
            <div>
              <h2 id="business-final-title" className="business-h2">
                {BUSINESS_UNIFYING}
              </h2>
              <p className="business-lead">{BUSINESS_CLOSER}</p>
              <div className="business-actions">
                <a className="business-btn business-btn--primary" href="#venues">
                  {BUSINESS_PICK_LABEL}
                </a>
                <a className="business-btn business-btn--secondary" href="#listen">
                  {BUSINESS_LISTEN_LABEL}
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="business-footer">
        <div className="business-wrap business-footer__grid">
          <div>
            <p className="business-wordmark">Аудиолад Бизнес</p>
            <p className="business-note">
              <Link href="/">На главную</Link>
              {" · "}
              <a href={`mailto:${BUSINESS_INQUIRY_EMAIL}`}>{BUSINESS_INQUIRY_EMAIL}</a>
            </p>
          </div>
          <LegalLinksNav />
        </div>
      </footer>
    </div>
  );
}
