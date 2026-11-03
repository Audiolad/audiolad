import Link from "next/link";

import { COFFEE_ATLAS_PATH } from "@/lib/business/coffee-atlas/constants";

import { articlePath, listVerticalArticles } from "@/lib/business/vertical-guides/registry";
import type { B2BVertical } from "@/lib/business/vertical-guides/types";

import GuideFooter from "./GuideFooter";

export default function GuideIndexView({ vertical }: { vertical: B2BVertical }) {
  const articles = listVerticalArticles(vertical.id);

  return (
    <div className="b2b-guide" data-coffee-guide="index">
      <header className="guide-header">
        <div className="guide-wrap guide-header__bar">
          <Link href={vertical.path} className="guide-brand">
            <span aria-hidden="true">☕</span>
            <span>{vertical.title}</span>
          </Link>
          <nav className="guide-header__nav" aria-label="Раздел">
            <Link href={COFFEE_ATLAS_PATH} target="_blank" rel="noopener" data-guide-header-link="atlas">
              Атлас: 10 удивительных кофеен мира
            </Link>
          </nav>
        </div>
      </header>
      <main id="content" className="guide-wrap guide-index">
        <p className="guide-kicker">Раздел</p>
        <h1 className="guide-display">{vertical.title}</h1>
        <p className="guide-index__intro">{vertical.intro}</p>
        <ul className="guide-index__list">
          {articles.map((article) => (
            <li key={article.slug}>
              <Link href={articlePath(article)}>
                <span>{article.title}</span>
                <small>{article.description}</small>
              </Link>
            </li>
          ))}
        </ul>
        {vertical.about && vertical.about.length > 0 && (
          <section id="o-razdele" className="guide-index__about" aria-labelledby="o-razdele-title">
            <h2 id="o-razdele-title">О разделе</h2>
            {vertical.about.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
            <p>
              Когда кофейня откроется, музыку для зала можно подключить в разделе{" "}
              <Link href="/b" target="_blank" rel="noopener">
                «Музыка для бизнеса»
              </Link>
              , а о правах на музыку в общественном месте рассказывает страница{" "}
              <Link href="/b/prava" target="_blank" rel="noopener">
                «Права на музыку»
              </Link>
              .
            </p>
          </section>
        )}
      </main>
      <GuideFooter />
    </div>
  );
}
