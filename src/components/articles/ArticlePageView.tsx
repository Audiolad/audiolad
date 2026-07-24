import Link from "next/link";

import ArticleAudioBlock from "@/components/articles/ArticleAudioBlock";
import ArticleFaqList from "@/components/articles/ArticleFaqList";
import { ArticlePlaybackProvider } from "@/components/articles/ArticlePlaybackProvider";
import ArticleRelatedPracticeClickTracker from "@/components/articles/ArticleRelatedPracticeClickTracker";
import ArticleToc from "@/components/articles/ArticleToc";
import ArticleTopicLink from "@/components/articles/ArticleTopicLink";
import ArticleViewTracker from "@/components/articles/ArticleViewTracker";
import CatalogProductCard from "@/components/products/CatalogProductCard";
import JsonLdScript from "@/components/seo/JsonLdScript";
import { buildArticleJsonLdGraph } from "@/lib/seo/articles";
import type { ArticlePageData } from "@/lib/seo/articles";

type ArticlePageViewProps = {
  data: ArticlePageData;
};

function readingTimeLabel(minutes: number): string {
  const mod10 = minutes % 10;
  const mod100 = minutes % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${minutes} минута чтения`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${minutes} минуты чтения`;
  }

  return `${minutes} минут чтения`;
}

const SECTION_SCROLL_CLASS =
  "scroll-mt-[calc(5.5rem+env(safe-area-inset-top,0px))]";

export default function ArticlePageView({ data }: ArticlePageViewProps) {
  const { article, primaryPractice } = data;
  const jsonLd = buildArticleJsonLdGraph(data);
  const tocItems = [
    ...article.sections.map((section) => ({
      id: section.id,
      title: section.title,
    })),
    {
      id: article.closingSection.id,
      title: article.closingSection.title,
    },
  ];
  const accessLabel = primaryPractice.isFree ? "Бесплатно" : primaryPractice.priceLabel;
  const authorSlug = primaryPractice.authorSlug ?? "";

  return (
    <>
      <JsonLdScript data={jsonLd} />
      <ArticleViewTracker
        path={data.path}
        articleSlug={article.slug}
        topicSlug={article.topicSlug}
        practiceSlug={primaryPractice.slug}
      />

      <ArticlePlaybackProvider
        articleSlug={article.slug}
        topicSlug={article.topicSlug}
        path={data.path}
        practiceId={primaryPractice.id}
        practiceSlug={primaryPractice.slug}
        authorSlug={authorSlug}
      >
        <article className="mx-auto max-w-[40rem] pb-10 pt-3 xl:pt-2">
          <nav
            aria-label="Хлебные крошки"
            className="text-[13px] leading-5 text-[#7d70a2] sm:text-sm sm:leading-6"
          >
            <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
              <li>
                <Link
                  href="/"
                  className="font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                >
                  Главная
                </Link>
              </li>
              <li aria-hidden="true">→</li>
              <li>
                <ArticleTopicLink
                  href={article.topicHref}
                  className="font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                >
                  {article.topicTitle}
                </ArticleTopicLink>
              </li>
              <li aria-hidden="true">→</li>
              <li className="text-[#25135c]" aria-current="page">
                {article.breadcrumbTitle}
              </li>
            </ol>
          </nav>

          <header className="mt-3 sm:mt-5">
            <h1 className="text-[1.65rem] font-semibold leading-[1.2] tracking-tight text-[#25135c] min-[360px]:text-[1.75rem] sm:text-3xl sm:leading-tight md:text-4xl">
              {article.title}
            </h1>
            <p className="mt-2.5 text-base leading-7 text-[#4a3d73] sm:mt-3 sm:text-[17px] sm:leading-8">
              {article.leadBeforeAudio}
            </p>
            <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
              {article.authorLabel} · {readingTimeLabel(data.readingTimeMinutes)}
            </p>
          </header>

          <div className="mt-4 sm:mt-5">
            <ArticleAudioBlock
              placement="top_player"
              product={primaryPractice}
              accessLabel={accessLabel}
              libraryAction={data.libraryAction}
              signInReturnPath={data.path}
            />
          </div>

          <p className="mt-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            {article.captionAfterAudio}
          </p>

          <aside
            aria-labelledby="article-short-answer-title"
            className="mt-8 rounded-[24px] border border-[#dfd0f3] bg-[#f7f1fc] px-5 py-5"
          >
            <h2
              id="article-short-answer-title"
              className="text-xl font-semibold tracking-tight text-[#25135c]"
            >
              Короткий ответ
            </h2>
            <p className="mt-3 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
              {article.shortAnswer}
            </p>
          </aside>

          <ArticleToc items={tocItems} />

          <div className="mt-8 space-y-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            {article.introAfterAudio.map((paragraph) => (
              <p key={paragraph.slice(0, 64)}>{paragraph}</p>
            ))}
          </div>

          {article.sections.map((section) => (
            <section key={section.id} className="mt-10">
              <h2
                id={section.id}
                className={`${SECTION_SCROLL_CLASS} text-2xl font-semibold tracking-tight text-[#25135c]`}
              >
                {section.title}
              </h2>
              <div className="mt-4 space-y-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph.slice(0, 64)}>{paragraph}</p>
                ))}
              </div>

              {section.id === "audiopraktika" ? (
                <div className="mt-6 space-y-4">
                  <p className="text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
                    {article.finalAudioLead}
                  </p>
                  <ArticleAudioBlock
                    placement="final_audio"
                    product={primaryPractice}
                    accessLabel={accessLabel}
                    libraryAction={data.libraryAction}
                    signInReturnPath={data.path}
                  />
                </div>
              ) : null}
            </section>
          ))}

          <section className="mt-10">
            <h2
              id={article.closingSection.id}
              className={`${SECTION_SCROLL_CLASS} text-2xl font-semibold tracking-tight text-[#25135c]`}
            >
              {article.closingSection.title}
            </h2>
            <div className="mt-4 space-y-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
              {article.closingSection.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 64)}>{paragraph}</p>
              ))}
            </div>
          </section>

          <section id="faq" className={`mt-12 ${SECTION_SCROLL_CLASS}`}>
            <h2 className="text-2xl font-semibold tracking-tight text-[#25135c]">
              Частые вопросы
            </h2>
            <ArticleFaqList items={article.faq} />
          </section>

          {data.relatedPractices.length > 0 ? (
            <section className="mt-12">
              <h2 className="text-2xl font-semibold tracking-tight text-[#25135c]">
                Связанные практики
              </h2>
              <ul className="mt-4 grid list-none gap-5 p-0">
                {data.relatedPractices.map(({ product, blurb }) => (
                  <li key={product.id}>
                    <p className="mb-2.5 text-[15px] font-medium leading-6 text-[#4a3d73]">
                      {blurb}
                    </p>
                    <ArticleRelatedPracticeClickTracker
                      practiceSlug={product.slug}
                    >
                      <CatalogProductCard product={product} />
                    </ArticleRelatedPracticeClickTracker>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-12">
            <h2 className="text-2xl font-semibold tracking-tight text-[#25135c]">
              Смотрите также
            </h2>
            <ul className="mt-4 grid list-none gap-3 p-0">
              <li>
                <ArticleTopicLink
                  href={article.topicHref}
                  className="block rounded-[20px] border border-[#e8def5] bg-[#faf7ff] px-5 py-4 transition hover:border-[#c9b6ea] hover:bg-[#f4ecfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                >
                  <span className="text-base font-semibold text-[#7042c5]">
                    Все практики о любви к себе
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-[#7d70a2]">
                    Тематическая подборка АудиоЛада
                  </span>
                </ArticleTopicLink>
              </li>
              <li>
                <Link
                  href="/topics/besplatnye-meditatsii"
                  className="block rounded-[20px] border border-[#e8def5] bg-[#faf7ff] px-5 py-4 transition hover:border-[#c9b6ea] hover:bg-[#f4ecfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                >
                  <span className="text-base font-semibold text-[#7042c5]">
                    Бесплатные медитации
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-[#7d70a2]">
                    Практики, которые можно слушать без оплаты
                  </span>
                </Link>
              </li>
            </ul>
          </section>
        </article>
      </ArticlePlaybackProvider>
    </>
  );
}
