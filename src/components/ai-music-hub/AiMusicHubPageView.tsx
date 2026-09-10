import Link from "next/link";
import type { ReactNode } from "react";

import ArticleFaqList from "@/components/articles/ArticleFaqList";
import {
  AI_MUSIC_HUB_BREADCRUMB_TITLE,
  AI_MUSIC_HUB_CLOSING_HEADING,
  AI_MUSIC_HUB_CLOSING_TEXT,
  AI_MUSIC_HUB_CTA_LABEL,
  AI_MUSIC_HUB_DURATION_NOTE,
  AI_MUSIC_HUB_DUAL_INCOME_HEADING,
  AI_MUSIC_HUB_DUAL_INCOME_TEXT,
  AI_MUSIC_HUB_ECONOMICS_HEADING,
  AI_MUSIC_HUB_ECONOMICS_INTRO,
  AI_MUSIC_HUB_ECONOMICS_STATS,
  AI_MUSIC_HUB_FAQ,
  AI_MUSIC_HUB_FAQ_HEADING,
  AI_MUSIC_HUB_FORMATS,
  AI_MUSIC_HUB_FORMATS_HEADING,
  AI_MUSIC_HUB_FORMATS_INTRO,
  AI_MUSIC_HUB_INTRO,
  AI_MUSIC_HUB_KICKER,
  AI_MUSIC_HUB_ONE_PURCHASE_FORMULA,
  AI_MUSIC_HUB_PAGE_H1,
  AI_MUSIC_HUB_PLATFORMS_HEADING,
  AI_MUSIC_HUB_PLATFORMS_TEXT,
  AI_MUSIC_HUB_PRODUCTS_EXAMPLES,
  AI_MUSIC_HUB_PRODUCTS_FORMULA,
  AI_MUSIC_HUB_PRODUCTS_HEADING,
  AI_MUSIC_HUB_PRODUCTS_INTRO,
  AI_MUSIC_HUB_SCALING_AFTER,
  AI_MUSIC_HUB_SCALING_HEADING,
  AI_MUSIC_HUB_SCALING_INTRO,
  AI_MUSIC_HUB_SCALING_ROWS,
  AI_MUSIC_HUB_SCENARIOS,
  AI_MUSIC_HUB_SCENARIOS_HEADING,
  AI_MUSIC_HUB_SCENARIOS_INTRO,
  AI_MUSIC_HUB_START_HEADING,
  AI_MUSIC_HUB_START_STEPS,
  AI_MUSIC_HUB_SUBTITLE,
  AI_MUSIC_HUB_SUNO_HEADING,
  AI_MUSIC_HUB_SUNO_TEXT,
  AI_MUSIC_HUB_TRUST_LINE,
  AI_MUSIC_HUB_WAYS,
  AI_MUSIC_HUB_WAYS_HEADING,
  AI_MUSIC_HUB_WAYS_INTRO,
} from "@/lib/seo/ai-music-hub";
import { BECOME_AUTHOR_HREF } from "@/lib/profile/constants";

const linkFocusClass =
  "focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

const proseClassName =
  "mt-4 space-y-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8";

const headingClassName =
  "scroll-mt-24 text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl";

const cardClassName =
  "rounded-[20px] border border-[#e8def5] bg-white px-5 py-4";

const primaryCtaClassName = `inline-flex min-h-11 w-full items-center justify-center rounded-[22px] bg-[#7042c5] px-5 py-3 text-[16px] font-medium text-white hover:bg-[#6338b0] sm:w-auto ${linkFocusClass}`;

function AuthorRegistrationCta() {
  return (
    <Link href={BECOME_AUTHOR_HREF} className={primaryCtaClassName}>
      {AI_MUSIC_HUB_CTA_LABEL}
    </Link>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-12 max-w-3xl" aria-labelledby={id}>
      <h2 id={id} className={headingClassName}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function AiMusicHubPageView() {
  return (
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
          <li>
            <Link
              href="/for-authors"
              className={`font-medium text-[#7042c5] underline-offset-2 hover:underline ${linkFocusClass}`}
            >
              Авторам
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-[#25135c]" aria-current="page">
            {AI_MUSIC_HUB_BREADCRUMB_TITLE}
          </li>
        </ol>
      </nav>

      <header className="mt-6 max-w-3xl rounded-[28px] border border-[#eadff8] bg-gradient-to-br from-[#fffaff] to-[#f2e6fb] px-5 py-6 shadow-[0_12px_30px_rgba(90,60,145,0.08)] sm:px-6 sm:py-7">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7042c5]">
          {AI_MUSIC_HUB_KICKER}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#25135c] sm:text-4xl">
          {AI_MUSIC_HUB_PAGE_H1}
        </h1>
        <p className="mt-4 text-lg font-medium leading-8 text-[#25135c] sm:text-xl">
          {AI_MUSIC_HUB_SUBTITLE}
        </p>
        <div className={proseClassName}>
          {AI_MUSIC_HUB_INTRO.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <div className="mt-7">
          <AuthorRegistrationCta />
        </div>
        <p className="mt-4 text-sm leading-6 text-[#7d70a2]">
          {AI_MUSIC_HUB_TRUST_LINE}
        </p>
      </header>

      <section
        id="ai-music-ways"
        className="mt-12 max-w-3xl scroll-mt-24"
        aria-labelledby="ai-music-ways-heading"
      >
        <h2 id="ai-music-ways-heading" className={headingClassName}>
          {AI_MUSIC_HUB_WAYS_HEADING}
        </h2>
        <p className={proseClassName}>{AI_MUSIC_HUB_WAYS_INTRO}</p>
        <ul className="mt-5 grid list-none gap-3 p-0 sm:grid-cols-2">
          {AI_MUSIC_HUB_WAYS.map((item, index) => (
            <li
              key={item.title}
              className={
                index === 0
                  ? cardClassName
                  : `${cardClassName} border-[#d8c8ee] bg-gradient-to-br from-[#faf7ff] to-[#f3e9fb]`
              }
            >
              <p className="text-xs font-semibold tracking-[0.12em] text-[#7042c5]">
                {index === 0 ? "01" : "02"}
              </p>
              <h3 className="mt-2 text-base font-semibold text-[#25135c] sm:text-lg">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#4a3d73] sm:text-[15px] sm:leading-7">
                {item.description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="ai-music-economics"
        className="mt-12 max-w-3xl scroll-mt-24"
        aria-labelledby="ai-music-economics-heading"
      >
        <h2 id="ai-music-economics-heading" className={headingClassName}>
          {AI_MUSIC_HUB_ECONOMICS_HEADING}
        </h2>
        <div className={proseClassName}>
          {AI_MUSIC_HUB_ECONOMICS_INTRO.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <ul className="mt-5 grid list-none grid-cols-2 gap-3 p-0">
          {AI_MUSIC_HUB_ECONOMICS_STATS.map((item) => (
            <li key={item.label} className={`${cardClassName} sm:px-6`}>
              <p className="text-xs leading-5 text-[#7d70a2] sm:text-sm">
                {item.label}
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-[#25135c] sm:text-3xl">
                {item.value}
              </p>
              <p className="mt-2 text-xs leading-5 text-[#4a3d73] sm:text-sm sm:leading-6">
                {item.hint}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-5 rounded-[20px] border border-[#d8c8ee] bg-[#faf7ff] px-5 py-4 text-base font-semibold leading-7 text-[#25135c] sm:text-[17px] sm:leading-8">
          {AI_MUSIC_HUB_ONE_PURCHASE_FORMULA}
        </p>
      </section>

      <Section id="ai-music-scaling" title={AI_MUSIC_HUB_SCALING_HEADING}>
        <p className={proseClassName}>{AI_MUSIC_HUB_SCALING_INTRO}</p>
        <div className="mt-5 sm:hidden">
          <ul className="space-y-2">
            {AI_MUSIC_HUB_SCALING_ROWS.map((row) => (
              <li
                key={row.sales}
                className="flex items-center justify-between gap-4 rounded-[20px] border border-[#e8def5] bg-white px-4 py-3"
              >
                <span className="text-sm text-[#7d70a2]">
                  {row.sales}{" "}
                  {row.sales === "1" ? "продажа" : "продаж"}
                </span>
                <span className="text-base font-semibold tabular-nums text-[#25135c]">
                  {row.author}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-5 hidden overflow-x-auto rounded-[20px] border border-[#e8def5] bg-white sm:block">
          <table className="w-full min-w-0 text-left text-sm">
            <caption className="sr-only">
              Доход автора при цене права использования 600 ₽
            </caption>
            <thead>
              <tr className="border-b border-[#eadff8] text-[#7d70a2]">
                <th scope="col" className="px-5 py-3 font-medium">
                  Число продаж права использования
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Доход автора
                </th>
              </tr>
            </thead>
            <tbody>
              {AI_MUSIC_HUB_SCALING_ROWS.map((row) => (
                <tr
                  key={row.sales}
                  className="border-b border-[#f4eefb] last:border-b-0"
                >
                  <td className="px-5 py-3 text-[#4a3d73]">{row.sales}</td>
                  <td className="px-5 py-3 font-semibold tabular-nums text-[#25135c]">
                    {row.author}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 rounded-[28px] border border-[#d8c8ee] bg-gradient-to-br from-[#fffaff] to-[#efe4fb] px-5 py-6 sm:px-6">
          <div className="space-y-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            {AI_MUSIC_HUB_SCALING_AFTER.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </Section>

      <section
        id="ai-music-dual-income"
        className="mt-12 max-w-3xl scroll-mt-24"
        aria-labelledby="ai-music-dual-income-heading"
      >
        <div className="rounded-[28px] border border-[#d8c8ee] bg-gradient-to-br from-[#fffaff] to-[#efe4fb] px-5 py-6 sm:px-6 sm:py-7">
          <h2 id="ai-music-dual-income-heading" className={headingClassName}>
            {AI_MUSIC_HUB_DUAL_INCOME_HEADING}
          </h2>
          <div className={proseClassName}>
            {AI_MUSIC_HUB_DUAL_INCOME_TEXT.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      <Section id="ai-music-products" title={AI_MUSIC_HUB_PRODUCTS_HEADING}>
        <div className={proseClassName}>
          {AI_MUSIC_HUB_PRODUCTS_INTRO.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <ul className="mt-5 grid list-none gap-3 p-0 sm:grid-cols-2">
          {AI_MUSIC_HUB_PRODUCTS_EXAMPLES.map((item) => (
            <li key={item.title} className={cardClassName}>
              <h3 className="text-base font-semibold text-[#25135c]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#4a3d73]">
                {item.description}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-5 rounded-[20px] border border-[#eadff8] bg-[#faf7ff] px-5 py-4 text-base leading-7 text-[#25135c] sm:text-[17px] sm:leading-8">
          {AI_MUSIC_HUB_PRODUCTS_FORMULA}
        </p>
      </Section>

      <Section id="ai-music-scenarios" title={AI_MUSIC_HUB_SCENARIOS_HEADING}>
        <p className={proseClassName}>{AI_MUSIC_HUB_SCENARIOS_INTRO}</p>
        <div className="mt-5 sm:hidden">
          <ul className="space-y-2">
            {AI_MUSIC_HUB_SCENARIOS.map((row) => (
              <li key={row.scene} className={cardClassName}>
                <h3 className="text-base font-semibold text-[#25135c]">
                  {row.scene}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#4a3d73]">
                  {row.use}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-5 hidden overflow-x-auto rounded-[20px] border border-[#e8def5] bg-white sm:block">
          <table className="w-full min-w-0 text-left text-sm">
            <caption className="sr-only">
              Примеры музыкальных продуктов по задачам
            </caption>
            <thead>
              <tr className="border-b border-[#eadff8] text-[#7d70a2]">
                <th scope="col" className="px-5 py-3 font-medium">
                  Сценарий
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Как используется музыка
                </th>
              </tr>
            </thead>
            <tbody>
              {AI_MUSIC_HUB_SCENARIOS.map((row) => (
                <tr
                  key={row.scene}
                  className="border-b border-[#f4eefb] last:border-b-0"
                >
                  <th
                    scope="row"
                    className="px-5 py-3 font-semibold text-[#25135c]"
                  >
                    {row.scene}
                  </th>
                  <td className="px-5 py-3 leading-6 text-[#4a3d73]">
                    {row.use}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#7d70a2] sm:text-[15px] sm:leading-7">
          {AI_MUSIC_HUB_DURATION_NOTE}
        </p>
      </Section>

      <Section id="ai-music-formats" title={AI_MUSIC_HUB_FORMATS_HEADING}>
        <p className={proseClassName}>{AI_MUSIC_HUB_FORMATS_INTRO}</p>
        <ul className="mt-5 grid list-none gap-3 p-0 sm:grid-cols-2">
          {AI_MUSIC_HUB_FORMATS.map((item) => (
            <li key={item.title} className={cardClassName}>
              <h3 className="text-base font-semibold text-[#25135c]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#4a3d73]">
                {item.description}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="ai-music-suno" title={AI_MUSIC_HUB_SUNO_HEADING}>
        <div className={proseClassName}>
          {AI_MUSIC_HUB_SUNO_TEXT.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </Section>

      <Section id="ai-music-platforms" title={AI_MUSIC_HUB_PLATFORMS_HEADING}>
        <div className={proseClassName}>
          {AI_MUSIC_HUB_PLATFORMS_TEXT.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </Section>

      <section
        id="ai-music-start"
        className="mt-12 max-w-3xl scroll-mt-24"
        aria-labelledby="ai-music-start-heading"
      >
        <h2 id="ai-music-start-heading" className={headingClassName}>
          {AI_MUSIC_HUB_START_HEADING}
        </h2>
        <ol className="mt-5 space-y-3">
          {AI_MUSIC_HUB_START_STEPS.map((step, index) => (
            <li key={step.title} className={cardClassName}>
              <p className="text-sm font-medium text-[#7042c5]">
                Шаг {index + 1}. {step.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#4a3d73]">
                {step.text}
              </p>
            </li>
          ))}
        </ol>
        <div className="mt-7">
          <AuthorRegistrationCta />
        </div>
      </section>

      <section
        className="mt-12 max-w-3xl rounded-[28px] border border-[#eadff8] bg-[#faf7ff] px-5 py-6 sm:px-6"
        aria-labelledby="ai-music-final-cta-heading"
      >
        <h2
          id="ai-music-final-cta-heading"
          className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl"
        >
          {AI_MUSIC_HUB_CLOSING_HEADING}
        </h2>
        <p className="mt-3 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
          {AI_MUSIC_HUB_CLOSING_TEXT}
        </p>
        <div className="mt-6">
          <AuthorRegistrationCta />
        </div>
      </section>

      <section
        id="ai-music-faq"
        className="mt-12 max-w-3xl scroll-mt-24"
        aria-labelledby="ai-music-faq-heading"
      >
        <h2 id="ai-music-faq-heading" className={headingClassName}>
          {AI_MUSIC_HUB_FAQ_HEADING}
        </h2>
        <ArticleFaqList items={AI_MUSIC_HUB_FAQ} />
      </section>
    </article>
  );
}
