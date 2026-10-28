import Image from "next/image";
import Link from "next/link";

import { COFFEE_ATLAS_OFFER } from "@/lib/business/coffee-atlas/constants";
import type { CoffeeAtlasTrack } from "@/lib/business/coffee-atlas/music";
import { articlePath } from "@/lib/business/vertical-guides/registry";
import type { VerticalGuideArticle } from "@/lib/business/vertical-guides/types";
import { getVertical } from "@/lib/business/vertical-guides/verticals";

import PracticeComments from "@/components/products/practice-page/PracticeComments";

import GuideChecklist from "./GuideChecklist";
import GuideExperts from "./GuideExperts";
import GuideFourCups from "./GuideFourCups";
import { GuideRichText } from "./GuideRichText";
import GuideTrack from "./GuideTrack";

type GuideArticleViewProps = {
  article: VerticalGuideArticle;
  track: CoffeeAtlasTrack | null;
};

export default function GuideArticleView({ article, track }: GuideArticleViewProps) {
  const vertical = getVertical(article.verticalId);
  const path = articlePath(article);

  return (
    <article className="b2b-guide" data-coffee-guide="article" data-guide-slug={article.slug}>
      <header className="guide-header">
        <div className="guide-wrap guide-header__bar">
          <Link href={vertical?.path ?? "/b"} className="guide-brand">
            <span aria-hidden="true">☕</span>
            <span>
              {vertical?.title}
              <small>{vertical?.kicker}</small>
            </span>
          </Link>
          <nav className="guide-header__nav" aria-label="Раздел">
            <Link href="/b/atlas-kofeen">Атлас кофеен</Link>
            <Link href="/b">АудиоЛад Бизнес</Link>
          </nav>
        </div>
      </header>

      <main id="content">
        <section className="guide-hero" aria-labelledby="guide-title">
          <div className="guide-hero__media">
            <Image src={article.hero.src} alt={article.hero.alt} fill priority sizes="100vw" />
          </div>
          <div className="guide-wrap guide-hero__copy">
            <p className="guide-kicker">Пилот раздела</p>
            <h1 id="guide-title" className="guide-display">
              {article.title}
            </h1>
            <p className="guide-hero__lead">{article.leadIn}</p>
            <p className="guide-hero__caption">{article.hero.caption}</p>
          </div>
        </section>

        <nav className="guide-wrap guide-crumbs" aria-label="Навигация по странице">
          <Link href="/">Главная</Link>
          <span aria-hidden="true">/</span>
          <Link href="/b">АудиоЛад Бизнес</Link>
          <span aria-hidden="true">/</span>
          <Link href={vertical?.path ?? "/b"}>{vertical?.title}</Link>
          <span aria-hidden="true">/</span>
          <span>{article.title}</span>
        </nav>

        <div className="guide-wrap guide-prose">
          {article.story.map((paragraph) => (
            <p key={paragraph.slice(0, 24)}>{paragraph}</p>
          ))}
        </div>

        <section className="guide-wrap guide-block" aria-labelledby="guide-cups-title">
          <GuideFourCups question={article.question} notes={article.cups} />
        </section>

        <div className="guide-wrap guide-prose">
          <figure className="guide-figure">
            <Image
              src="/business/atlas-kofeen/cafe-tortoni-hero.webp"
              alt="Вход в Café Tortoni под чугунным козырьком, пара танцует танго на улице."
              width={1200}
              height={800}
              sizes="(min-width: 800px) 720px, 100vw"
            />
            <figcaption>
              Кадр из атласа: Café Tortoni. АудиоЛад не связан с этой кофейней.
            </figcaption>
          </figure>
        </div>

        <section className="guide-band" id="listen" aria-labelledby="guide-listen-title">
          <div className="guide-wrap guide-listen">
            <div>
              <p className="guide-kicker">Пример из каталога</p>
              <h2 id="guide-listen-title" className="guide-display guide-h2">
                Послушать атмосферу
              </h2>
              <p>
                <GuideRichText parts={article.playerLead} />
              </p>
            </div>
            <GuideTrack track={track} trackPagePath={article.trackPagePath} />
          </div>
        </section>

        <section className="guide-wrap guide-block" id="guide-comments" aria-labelledby="listener-impressions-title">
          <p>
            Впечатление о треке «Джаз лаунж» оставляют здесь. Запись попадает в ту же ленту, что и на его странице в каталоге.
          </p>
          <PracticeComments
            authorSlug={article.track.authorSlug}
            productSlug={article.track.productSlug}
            practiceId={track?.id ?? article.track.productSlug}
            isAuthenticated={false}
            signInReturnPath={path}
          />
        </section>

        <section className="guide-wrap guide-block">
          <GuideChecklist
            title={article.checklistTitle}
            storageKey={article.checklistStorageKey}
            items={article.checklist}
          />
        </section>

        <section className="guide-wrap guide-block" aria-labelledby="guide-experts-title">
          <h2 id="guide-experts-title" className="guide-display guide-h2">
            Два голоса из профессии
          </h2>
          <p className="guide-prose">
            Цитаты приведены дословно. Мостик перед ними объясняет, на какой вопрос отвечал человек, и не дописывает ему совет о плейлисте.
          </p>
          <GuideExperts slots={article.experts} />
        </section>

        {article.sections.map((section) => (
          <section key={section.id} className="guide-wrap guide-block" aria-labelledby={section.id}>
            <h2 id={section.id} className="guide-display guide-h2">
              {section.heading}
            </h2>
            <div className="guide-prose">
              {section.paragraphs.map((paragraph, index) => (
                <p key={`${section.id}-${index}`}>
                  <GuideRichText parts={paragraph} />
                </p>
              ))}
              {section.subsections?.map((subsection) => (
                <div key={subsection.heading}>
                  <h3 className="guide-display guide-h3">{subsection.heading}</h3>
                  {subsection.paragraphs.map((paragraph, index) => (
                    <p key={`${subsection.heading}-${index}`}>
                      <GuideRichText parts={paragraph} />
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="guide-wrap guide-block" aria-labelledby="guide-faq-title">
          <h2 id="guide-faq-title" className="guide-display guide-h2">
            Вопросы
          </h2>
          <div className="guide-faq">
            {article.faq.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="guide-wrap guide-block" aria-labelledby="guide-more-title">
          <h2 id="guide-more-title" className="guide-display guide-h2">
            Куда свернуть дальше
          </h2>
          <ul className="guide-links">
            {article.further.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </section>

        <aside className="guide-wrap guide-offer">
          <p className="guide-kicker">Для зала</p>
          <h2 className="guide-display guide-h3">{COFFEE_ATLAS_OFFER.title}</h2>
          <p>
            {COFFEE_ATLAS_OFFER.price} {COFFEE_ATLAS_OFFER.period}. {COFFEE_ATLAS_OFFER.trial}.
          </p>
          <p>
            <Link href="/b">Открыть АудиоЛад Бизнес</Link>
            {" · "}
            <Link href={COFFEE_ATLAS_OFFER.rightsHref}>{COFFEE_ATLAS_OFFER.rights}</Link>
          </p>
          <p className="guide-offer__note">
            Прослушивание примера на этой странице не заменяет документы заведения и не является выводом о правах на публичное исполнение.
          </p>
        </aside>
      </main>

      <footer className="guide-footer">
        <div className="guide-wrap">
          <p>
            Материал пилота, адрес {path}. АудиоЛад не связан с кофейнями атласа. Их названия принадлежат владельцам.
          </p>
        </div>
      </footer>
    </article>
  );
}
