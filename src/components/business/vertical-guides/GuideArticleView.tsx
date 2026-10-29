import Link from "next/link";

import { COFFEE_ATLAS_PATH } from "@/lib/business/coffee-atlas/constants";
import { articlePath } from "@/lib/business/vertical-guides/registry";
import type { VerticalGuideArticle } from "@/lib/business/vertical-guides/types";
import { getVertical } from "@/lib/business/vertical-guides/verticals";

import GuideAtlasCardsBanner from "./GuideAtlasCardsBanner";
import GuideAtlasHeroBanner from "./GuideAtlasHeroBanner";
import GuideChecklist from "./GuideChecklist";
import GuideExpertCard from "./GuideExpertCard";
import GuideFaq from "./GuideFaq";
import GuideFinalCups from "./GuideFinalCups";
import GuideFourCups from "./GuideFourCups";
import GuideReadMore from "./GuideReadMore";
import GuideSections from "./GuideSections";
import GuideSteps from "./GuideSteps";
import GuideTable from "./GuideTable";

/**
 * Fixed block order of every vertical guide article (docs/business/coffee-guides/TEMPLATE.md).
 * No long runs of text: every text section is followed by an insert (banner, table, expert).
 * The article file only supplies data; this view owns the markup.
 */
export default function GuideArticleView({ article }: { article: VerticalGuideArticle }) {
  const vertical = getVertical(article.verticalId);
  const verticalPath = vertical?.path ?? "/b";
  const path = articlePath(article);

  return (
    <article className="b2b-guide" data-coffee-guide="article" data-guide-slug={article.slug}>
      <header className="guide-header">
        <div className="guide-wrap guide-header__bar">
          <Link href={verticalPath} className="guide-brand">
            <span aria-hidden="true">☕</span>
            <span>{vertical?.title}</span>
          </Link>
          <nav className="guide-header__nav" aria-label="Раздел">
            <Link href={COFFEE_ATLAS_PATH}>Атлас: 10 удивительных кофеен мира</Link>
          </nav>
        </div>
      </header>

      <main id="content">
        <nav className="guide-wrap guide-crumbs" aria-label="Навигация по странице">
          <Link href="/">Главная</Link>
          <span aria-hidden="true">/</span>
          <Link href={verticalPath}>{vertical?.title}</Link>
          <span aria-hidden="true">/</span>
          <span>{article.title}</span>
        </nav>

        <section className="guide-hero" aria-labelledby="guide-title">
          <div className="guide-wrap">
            <h1 id="guide-title" className="guide-display">
              {article.title}
            </h1>
            {vertical?.byline && <p className="guide-byline">{vertical.byline}</p>}
          </div>
        </section>

        <div className="guide-wrap guide-prose guide-intro">
          {article.intro.map((paragraph) => (
            <p key={paragraph.slice(0, 32)}>{paragraph}</p>
          ))}
        </div>

        <section className="guide-wrap guide-block guide-block--cups" aria-labelledby="guide-cups-title">
          <GuideFourCups question={article.question} />
        </section>

        <GuideSections sections={[article.partOne[0]]} />
        <GuideAtlasHeroBanner />
        <GuideSections sections={[article.partOne[1]]} />
        <GuideTable table={article.table} />
        <GuideSections sections={[article.partTwo[0]]} />
        <GuideExpertCard slot={article.expertOne} />
        <GuideSections sections={[article.partTwo[1]]} />
        <GuideAtlasCardsBanner />
        <GuideSections sections={[article.partTwo[2]]} />
        <GuideExpertCard slot={article.expertTwo} />
        <GuideSteps steps={article.steps} />

        <section className="guide-wrap guide-block">
          <GuideChecklist
            title={article.checklist.title}
            storageKey={article.checklist.storageKey}
            items={article.checklist.items}
            note={article.checklist.note}
            doneNote={article.checklist.doneNote}
          />
        </section>

        <GuideFaq items={article.faq} />
        <GuideFinalCups question={article.finalQuestion} />
        <GuideReadMore links={article.readMore} />
      </main>

      <footer className="guide-footer">
        <div className="guide-wrap">
          <p>
            Адрес материала: {path}. АудиоЛад не связан с кофейнями атласа. Их названия принадлежат владельцам.
          </p>
        </div>
      </footer>
    </article>
  );
}
