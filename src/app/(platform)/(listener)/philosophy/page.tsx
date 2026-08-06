import Link from "next/link";
import type { Metadata } from "next";

import PhilosophyToc from "@/components/philosophy/PhilosophyToc";
import JsonLd from "@/components/seo/JsonLd";
import { buildPhilosophyPageJsonLd } from "@/lib/seo/json-ld";
import {
  PHILOSOPHY_DECISION_CRITERIA,
  PHILOSOPHY_DECISION_QUESTION,
  PHILOSOPHY_DECISIONS_INTRO,
  PHILOSOPHY_FAQ,
  PHILOSOPHY_INTRO_NOTE,
  PHILOSOPHY_LEAD,
  PHILOSOPHY_PAGE_H1,
  PHILOSOPHY_SECTIONS,
  PHILOSOPHY_SEO_DESCRIPTION,
} from "@/lib/seo/philosophy/content";
import { buildPhilosophyMetadata } from "@/lib/seo/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildPhilosophyMetadata();
}

const linkFocusClass =
  "focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

const proseClassName =
  "mt-4 space-y-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8";

const headingClassName =
  "scroll-mt-24 text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl";

function DecisionsSection() {
  return (
    <section className="mt-12 max-w-3xl" aria-labelledby="decisions">
      <h2 id="decisions" className={headingClassName}>
        Как мы принимаем решения
      </h2>
      <div className={proseClassName}>
        {PHILOSOPHY_DECISIONS_INTRO.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <aside className="mt-6 rounded-[24px] border border-[#e8def5] bg-[#faf7ff] px-5 py-5 sm:px-6">
        <p className="text-lg font-semibold leading-8 text-[#25135c] sm:text-xl">
          {PHILOSOPHY_DECISION_QUESTION}
        </p>
        <p className="mt-4 text-sm leading-6 text-[#4a3d73] sm:text-[15px] sm:leading-7">
          Дополнительные критерии, которые помогают проверить решение:
        </p>
        <ul className="mt-3 space-y-2">
          {PHILOSOPHY_DECISION_CRITERIA.map((item) => (
            <li key={item} className="flex gap-3 text-sm leading-6 text-[#4a3d73] sm:text-[15px] sm:leading-7">
              <span
                aria-hidden="true"
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7042c5]"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </aside>
    </section>
  );
}

export default function PhilosophyPage() {
  const jsonLd = buildPhilosophyPageJsonLd({
    title: PHILOSOPHY_PAGE_H1,
    description: PHILOSOPHY_SEO_DESCRIPTION,
    path: "/philosophy",
    faq: PHILOSOPHY_FAQ.map((item) => ({
      question: item.question,
      answer: item.answer,
    })),
  });

  return (
    <>
      <JsonLd data={jsonLd} />

      <article className="pb-12 pt-4">
        <nav aria-label="Хлебные крошки" className="text-sm text-[#7d70a2]">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link
                href="/"
                className={`font-medium text-[#7042c5] underline-offset-2 hover:underline ${linkFocusClass}`}
              >
                Главная
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-[#25135c]" aria-current="page">
              Принципы АудиоЛада
            </li>
          </ol>
        </nav>

        <header className="mt-6 max-w-3xl">
          <p className="text-sm font-medium text-[#8c7dab]">{PHILOSOPHY_INTRO_NOTE}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#25135c] sm:text-4xl">
            {PHILOSOPHY_PAGE_H1}
          </h1>
          <p className="mt-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            {PHILOSOPHY_LEAD}
          </p>
          <p className="mt-5">
            <Link
              href="/about"
              className={`text-[15px] font-medium text-[#7042c5] underline-offset-2 hover:underline ${linkFocusClass}`}
            >
              О платформе
            </Link>
          </p>
        </header>

        <PhilosophyToc />

        {PHILOSOPHY_SECTIONS.map((section) => (
          <div key={section.id}>
            <section className="mt-12 max-w-3xl" aria-labelledby={section.id}>
              <h2 id={section.id} className={headingClassName}>
                {section.title}
              </h2>
              <div className={proseClassName}>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>

            {section.id === "ai" ? <DecisionsSection /> : null}

            {section.id === "closing" ? (
              <div className="mt-8 flex max-w-3xl flex-wrap gap-3">
                <Link
                  href="/about"
                  className={`inline-flex min-h-11 items-center justify-center rounded-[22px] border border-[#c9b5e8] bg-white px-5 py-3 text-[16px] font-medium text-[#7042c5] hover:bg-[#faf7ff] ${linkFocusClass}`}
                >
                  Узнать больше о платформе
                </Link>
                <Link
                  href="/catalog"
                  className={`inline-flex min-h-11 items-center justify-center rounded-[22px] bg-[#7042c5] px-5 py-3 text-[16px] font-medium text-white hover:bg-[#6338b0] ${linkFocusClass}`}
                >
                  Перейти в каталог
                </Link>
              </div>
            ) : null}
          </div>
        ))}

        <section className="mt-12 max-w-3xl" aria-labelledby="faq">
          <h2 id="faq" className={headingClassName}>
            Частые вопросы
          </h2>
          <p className="mt-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            Краткие ответы о статусе документа, ответственности платформы и
            связанных юридических материалах.
          </p>
          <div className="mt-6 space-y-4">
            {PHILOSOPHY_FAQ.map((item) => (
              <div
                key={item.question}
                className="rounded-[20px] border border-[#e8def5] bg-white px-5 py-4"
              >
                <h3 className="text-base font-semibold text-[#25135c]">
                  {item.question}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#4a3d73] sm:text-[15px] sm:leading-7">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm leading-6 text-[#7d70a2]">
            Юридические документы:{" "}
            <Link
              href="/offer"
              className={`font-medium text-[#7042c5] underline-offset-2 hover:underline ${linkFocusClass}`}
            >
              оферта
            </Link>
            ,{" "}
            <Link
              href="/privacy"
              className={`font-medium text-[#7042c5] underline-offset-2 hover:underline ${linkFocusClass}`}
            >
              политика обработки персональных данных
            </Link>
            ,{" "}
            <Link
              href="/payment-and-refund"
              className={`font-medium text-[#7042c5] underline-offset-2 hover:underline ${linkFocusClass}`}
            >
              оплата и возврат
            </Link>
            ,{" "}
            <Link
              href="/author-terms"
              className={`font-medium text-[#7042c5] underline-offset-2 hover:underline ${linkFocusClass}`}
            >
              авторские условия
            </Link>
            .
          </p>
        </section>
      </article>
    </>
  );
}
