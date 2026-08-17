"use client";

import Link from "next/link";
import { useEffect } from "react";

import HelpRichText from "@/components/help/HelpRichText";
import {
  trackHelpArticleCtaClick,
  trackHelpArticleView,
} from "@/lib/help/analytics";
import { getHelpCategory } from "@/lib/help/categories";
import { helpArticlePath, helpHubHref, helpSupportHref } from "@/lib/help/paths";
import type { HelpArticle } from "@/lib/help/types";

type HelpArticleViewProps = {
  article: HelpArticle;
  related: HelpArticle[];
  /** Author workspace slug for return links (`?author=`). */
  authorSlug?: string | null;
};

function withOptionalAuthor(href: string, authorSlug?: string | null): string {
  if (!authorSlug || !href.startsWith("/author-dashboard")) return href;
  const url = new URL(href, "https://audiolad.local");
  if (!url.searchParams.has("author")) {
    url.searchParams.set("author", authorSlug);
  }
  return `${url.pathname}${url.search}`;
}

export default function HelpArticleView({
  article,
  related,
  authorSlug,
}: HelpArticleViewProps) {
  const category = getHelpCategory(article.category);
  const path = helpArticlePath(article);

  useEffect(() => {
    trackHelpArticleView({
      articleId: article.id,
      category: article.category,
      path,
    });
  }, [article.category, article.id, path]);

  const ctaHref = article.cta
    ? withOptionalAuthor(article.cta.href, authorSlug)
    : null;

  return (
    <article className="pb-10 pt-4">
      <nav aria-label="Хлебные крошки" className="text-sm text-[#7d70a2]">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link
              href={helpHubHref()}
              className="font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              Справочный центр
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <span className="text-[#5f5484]">{category.title}</span>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-[#25135c]" aria-current="page">
            {article.title}
          </li>
        </ol>
      </nav>

      <header className="mt-6 max-w-3xl">
        <p className="text-sm font-medium text-[#8c7dab]">{category.title}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#25135c] sm:text-4xl">
          {article.heading ?? article.title}
        </h1>
        <p className="mt-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
          {article.description}
        </p>
      </header>

      <div className="mt-8 max-w-3xl space-y-8">
        {article.sections.map((section) => (
          <section
            key={section.id}
            aria-labelledby={
              section.title ? `help-section-${section.id}` : undefined
            }
          >
            {section.title ? (
              section.headingLevel === 3 ? (
                <h3
                  id={`help-section-${section.id}`}
                  className="text-lg font-semibold tracking-tight text-[#25135c] sm:text-xl"
                >
                  {section.title}
                </h3>
              ) : (
                <h2
                  id={`help-section-${section.id}`}
                  className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl"
                >
                  {section.title}
                </h2>
              )
            ) : null}

            {section.paragraphs?.map((paragraph, index) => (
              <HelpRichText
                key={`${section.id}-p-${index}`}
                as="p"
                value={paragraph}
                className="mt-3 text-[15px] leading-7 text-[#4c3d78] sm:text-base sm:leading-8"
              />
            ))}

            {section.steps && section.steps.length > 0 ? (
              <ol className="mt-4 list-decimal space-y-3 pl-5 marker:font-semibold marker:text-[#7042c5]">
                {section.steps.map((step, index) => (
                  <li
                    key={`${section.id}-s-${index}`}
                    className="text-[15px] leading-7 text-[#4c3d78] sm:text-base sm:leading-8"
                  >
                    <HelpRichText value={step} />
                  </li>
                ))}
              </ol>
            ) : null}

            {section.figures?.map((figure) =>
              figure.src ? (
                <figure
                  key={figure.id}
                  className="mt-4 overflow-hidden rounded-[20px] border border-[#eadff8] bg-[#fcfbfe]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={figure.src}
                    alt={figure.alt}
                    className="h-auto w-full"
                  />
                  <figcaption className="px-4 py-3 text-sm leading-6 text-[#5f5484]">
                    {figure.caption}
                  </figcaption>
                </figure>
              ) : null,
            )}

            {section.notes && section.notes.length > 0 ? (
              <ul className="mt-4 space-y-2 rounded-[20px] border border-[#eadff8] bg-[#fcfbfe] px-4 py-4">
                {section.notes.map((note, index) => (
                  <li
                    key={`${section.id}-n-${index}`}
                    className="text-sm leading-6 text-[#5f5484]"
                  >
                    <HelpRichText value={note} />
                  </li>
                ))}
              </ul>
            ) : null}

            {section.faq && section.faq.length > 0 ? (
              <dl className="mt-4 space-y-5">
                {section.faq.map((item, index) => (
                  <div key={`${section.id}-faq-${index}`}>
                    <dt>
                      <h3 className="text-lg font-semibold tracking-tight text-[#25135c]">
                        {item.question}
                      </h3>
                    </dt>
                    <dd>
                      <HelpRichText
                        as="p"
                        value={item.answer}
                        className="mt-2 text-[15px] leading-7 text-[#4c3d78] sm:text-base sm:leading-8"
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>
        ))}
      </div>

      {article.cta && ctaHref ? (
        <div className="mt-10 max-w-3xl">
          <Link
            href={ctaHref}
            onClick={() =>
              trackHelpArticleCtaClick({ articleId: article.id, path })
            }
            className="inline-flex min-h-12 items-center justify-center rounded-[18px] bg-[#7042c5] px-6 text-[15px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            {article.cta.label}
          </Link>
        </div>
      ) : null}

      {related.length > 0 ? (
        <section
          className="mt-12 max-w-3xl"
          aria-labelledby="help-related-heading"
        >
          <h2
            id="help-related-heading"
            className="text-xl font-semibold tracking-tight text-[#25135c]"
          >
            Смотрите также
          </h2>
          <ul className="mt-4 space-y-3">
            {related.map((item) => (
              <li key={item.id}>
                <Link
                  href={helpArticlePath(item)}
                  className="block rounded-[20px] border border-[#eadff8] bg-white px-4 py-4 transition hover:border-[#c9b6ea] hover:bg-[#faf7ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                >
                  <span className="font-semibold text-[#25135c]">
                    {item.title}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-[#5f5484]">
                    {item.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-12 max-w-3xl rounded-[24px] border border-[#eadff8] bg-white px-5 py-5">
        <h2 className="text-lg font-semibold text-[#25135c]">Не нашли ответ?</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f5484]">
          Если инструкция не помогла, задайте вопрос поддержке. Ответ придёт на
          электронную почту.
        </p>
        <Link
          href={helpSupportHref({ source: path })}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[16px] border border-[#eadff8] bg-[#f7f2fc] px-5 text-sm font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Задать вопрос
        </Link>
      </section>
    </article>
  );
}
