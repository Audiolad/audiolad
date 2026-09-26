import Image from "next/image";
import Link from "next/link";

import BusinessInquiryForm from "@/components/business/BusinessInquiryForm";
import BusinessListenRail from "@/components/business/BusinessListenRail";
import BusinessSnapCarousel from "@/components/business/BusinessSnapCarousel";
import LegalLinksNav from "@/components/legal/LegalLinksNav";
import {
  BUSINESS_FAQ,
  BUSINESS_HOW_LABEL,
  BUSINESS_INQUIRY_EMAIL,
  BUSINESS_LANDING_H1,
  BUSINESS_LANDING_SUBCOPY,
  BUSINESS_LEGAL_QUOTE_CARDS_ENABLED,
  BUSINESS_PILLARS,
  BUSINESS_PROBLEM_HEADING,
  BUSINESS_PROBLEM_LEAD,
  BUSINESS_SEO_ARTICLES,
  BUSINESS_SOURCES,
  BUSINESS_SOURCES_NOTE,
  BUSINESS_STEPS,
  BUSINESS_TRY_LABEL,
  BUSINESS_VENUES,
  BUSINESS_WHY,
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
            <a className="business-btn business-btn--primary" href="#listen">
              {BUSINESS_TRY_LABEL}
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
              <div className="business-actions">
                <a className="business-btn business-btn--primary" href="#listen">
                  {BUSINESS_TRY_LABEL}
                </a>
                <a className="business-btn business-btn--secondary" href="#how">
                  {BUSINESS_HOW_LABEL}
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

        <section className="business-section" aria-labelledby="business-venues-title">
          <div className="business-wrap">
            <h2 id="business-venues-title" className="business-h2">
              Где звучит наша музыка
            </h2>
            <p className="business-lead">
              Примеры пространств. Отдельные страницы отраслей ещё не опубликованы,
              поэтому карточки не ведут на пустые адреса.
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

        <section className="business-section" aria-labelledby="business-problem-title">
          <div className="business-wrap">
            <h2 id="business-problem-title" className="business-h2">
              {BUSINESS_PROBLEM_HEADING}
            </h2>
            <p className="business-lead">{BUSINESS_PROBLEM_LEAD}</p>
            <ul className="business-card-grid">
              {BUSINESS_PILLARS.map((pillar) => (
                <li key={pillar.id} className="business-card">
                  <h3>{pillar.title}</h3>
                  <p>{pillar.text}</p>
                </li>
              ))}
            </ul>
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
            <div className="business-actions">
              <a className="business-btn business-btn--primary" href="#listen">
                {BUSINESS_TRY_LABEL}
              </a>
            </div>
          </div>
        </section>

        <section className="business-section" id="listen" aria-labelledby="business-listen-title">
          <div className="business-wrap">
            <h2 id="business-listen-title" className="business-h2">
              Послушать примеры
            </h2>
            <p className="business-lead">
              Звук идёт через общий плеер сайта. Это прослушивание примера, а не
              разрешение включать музыку в зале.
            </p>
            <div className="mt-6">
              <BusinessListenRail items={listenExamples} />
            </div>
          </div>
        </section>

        <section className="business-section" id="trial" aria-labelledby="business-trial-title">
          <div className="business-wrap business-split business-split--half">
            <div>
              <h2 id="business-trial-title" className="business-h2">
                Попробовать
              </h2>
              <p className="business-lead">
                Отдельной регистрации бизнеса, оплаты и пробного доступа на сайте
                нет. Можно послушать примеры или отправить заявку.
              </p>
              <p className="business-copy">
                На иллюстрации указан пробный срок. Кнопки ниже его не включают.
              </p>
              <div className="business-actions">
                <a className="business-btn business-btn--primary" href="#listen">
                  {BUSINESS_TRY_LABEL}
                </a>
                <a className="business-btn business-btn--secondary" href="#connect">
                  Оставить заявку
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
                Понятные условия использования
              </h2>
              <p className="business-lead">
                Условия должны быть ясны до того, как музыка зазвучит для гостей.
                Конкретный объём прав фиксируется документами, а не картинкой на
                странице.
              </p>
              <p className="business-copy">
                Сейчас опубликованы документы платформы для слушателей. Отдельный
                комплект для фонового звучания в бизнесе здесь не выложен.
              </p>
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

        <section className="business-section" aria-labelledby="business-sources-title">
          <div className="business-wrap business-sources">
            <h2 id="business-sources-title" className="business-h2">
              Публичные источники
            </h2>
            <p className="business-lead">{BUSINESS_SOURCES_NOTE}</p>
            <Poster
              file="15-authoritative-sources.webp"
              alt="Гражданский кодекс РФ, Роспатент, Верховный суд, РАО, Коммерсантъ и РБК."
              width={2172}
              height={724}
              sizes="(min-width: 1280px) 1320px, 100vw"
              eager
              className="business-poster business-sources-composite"
            />
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

        <section className="business-section" aria-labelledby="business-why-title">
          <div className="business-wrap">
            <h2 id="business-why-title" className="business-h2">
              Почему Аудиолад Бизнес
            </h2>
            <ul className="business-why business-card-grid">
              {BUSINESS_WHY.map((item) => (
                <li key={item.id} className="business-card">
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="business-section" id="connect" aria-labelledby="business-connect-title">
          <div className="business-wrap">
            <h2 id="business-connect-title" className="business-h2">
              Подключить
            </h2>
            <p className="business-lead">
              Опубликованного тарифа нет, поэтому цена здесь не указана. Напишите,
              сколько точек нужно подключить.
            </p>
            <div className="business-inquiry">
              <BusinessInquiryForm />
            </div>
            <p className="business-copy">
              Заявка не создаёт аккаунт и не проводит оплату. Если почтовая
              программа не открылась, напишите на{" "}
              <a href={`mailto:${BUSINESS_INQUIRY_EMAIL}`}>{BUSINESS_INQUIRY_EMAIL}</a>.
            </p>
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
                Музыка для вашего пространства
              </h2>
              <p className="business-lead">
                Послушайте пример или напишите, сколько точек нужно подключить.
              </p>
              <div className="business-actions">
                <a className="business-btn business-btn--primary" href="#listen">
                  {BUSINESS_TRY_LABEL}
                </a>
                <a className="business-btn business-btn--secondary" href="#how">
                  {BUSINESS_HOW_LABEL}
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
