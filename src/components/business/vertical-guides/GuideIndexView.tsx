import Link from "next/link";

import { articlePath, listVerticalArticles } from "@/lib/business/vertical-guides/registry";
import type { B2BVertical } from "@/lib/business/vertical-guides/types";

export default function GuideIndexView({ vertical }: { vertical: B2BVertical }) {
  const articles = listVerticalArticles(vertical.id);

  return (
    <div className="b2b-guide" data-coffee-guide="index">
      <header className="guide-header">
        <div className="guide-wrap guide-header__bar">
          <Link href="/b" className="guide-brand">
            <span aria-hidden="true">☕</span>
            <span>
              АудиоЛад Бизнес
              <small>{vertical.kicker}</small>
            </span>
          </Link>
          <nav className="guide-header__nav" aria-label="Раздел">
            <Link href="/b/atlas-kofeen">Атлас кофеен</Link>
            <Link href="/b">На главную бизнеса</Link>
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
      </main>
    </div>
  );
}
