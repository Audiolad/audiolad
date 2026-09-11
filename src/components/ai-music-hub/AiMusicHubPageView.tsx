import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  AI_MUSIC_HUB_AUTHORS_HEADING,
  AI_MUSIC_HUB_AUTHORS_TEXT,
  AI_MUSIC_HUB_BREADCRUMB_TITLE,
  AI_MUSIC_HUB_CLOSING_HEADING,
  AI_MUSIC_HUB_CLOSING_NOTE,
  AI_MUSIC_HUB_CLOSING_TEXT,
  AI_MUSIC_HUB_CTA_LABEL,
  AI_MUSIC_HUB_DUAL_INCOME_HEADING,
  AI_MUSIC_HUB_DUAL_INCOME_LEAD,
  AI_MUSIC_HUB_DUAL_INCOME_RECAP_HEADING,
  AI_MUSIC_HUB_DUAL_INCOME_RECAP_TEXT,
  AI_MUSIC_HUB_ECONOMICS_HEADING,
  AI_MUSIC_HUB_ECONOMICS_INTRO,
  AI_MUSIC_HUB_ECONOMICS_ROWS,
  AI_MUSIC_HUB_ECONOMICS_TEXT,
  AI_MUSIC_HUB_INTRO,
  AI_MUSIC_HUB_LISTENERS_HEADING,
  AI_MUSIC_HUB_LISTENERS_TEXT,
  AI_MUSIC_HUB_PAGE_H1,
  AI_MUSIC_HUB_REPEAT_HEADING,
  AI_MUSIC_HUB_REPEAT_TEXT,
  AI_MUSIC_HUB_RIGHTS_HEADING,
  AI_MUSIC_HUB_RIGHTS_TEXT,
  AI_MUSIC_HUB_SCREENSHOTS,
  AI_MUSIC_HUB_START_SMALL_HEADING,
  AI_MUSIC_HUB_START_SMALL_TEXT,
  AI_MUSIC_HUB_STEPS_HEADING,
  AI_MUSIC_HUB_STEPS_LEAD,
  AI_MUSIC_HUB_STEPS_LINE,
  AI_MUSIC_HUB_STEPS_TEXT,
  AI_MUSIC_HUB_SUBTITLE,
  AI_MUSIC_HUB_SUNO_HEADING,
  AI_MUSIC_HUB_SUNO_TEXT,
  AI_MUSIC_HUB_WHAT_IS_HEADING,
  AI_MUSIC_HUB_WHAT_IS_TEXT,
  type AiMusicHubScreenshot,
} from "@/lib/seo/ai-music-hub";
import { BECOME_AUTHOR_HREF } from "@/lib/profile/constants";

import "./ai-music-hub-cta.css";

const linkFocusClass =
  "focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

const proseClassName =
  "mt-5 space-y-5 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8";

const headingClassName =
  "scroll-mt-24 text-2xl font-semibold tracking-tight text-[#25135c] sm:text-3xl";

const thesisClassName =
  "scroll-mt-24 text-[1.65rem] font-semibold leading-tight tracking-tight text-[#25135c] sm:text-4xl";

const highlightBlockClassName =
  "rounded-[28px] border border-[#d8c8ee] bg-gradient-to-br from-[#fffaff] to-[#efe4fb] px-5 py-7 sm:px-7 sm:py-9";

const primaryCtaClassName = `ai-music-hub-cta inline-flex min-h-12 w-full max-w-full items-center justify-center gap-2.5 rounded-[22px] bg-[#7042c5] px-5 py-3 text-center text-[16px] font-medium leading-6 text-white hover:bg-[#6338b0] sm:w-auto sm:px-6 ${linkFocusClass}`;

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M5.6 12.2 10.1 16.6 18.4 7.6"
        stroke="currentColor"
        strokeWidth="3.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AuthorRegistrationCta() {
  return (
    <Link href={BECOME_AUTHOR_HREF} className={primaryCtaClassName}>
      <span className="ai-music-hub-cta__check" aria-hidden="true">
        <CheckIcon />
      </span>
      <span>{AI_MUSIC_HUB_CTA_LABEL}</span>
    </Link>
  );
}

function Paragraphs({
  items,
  className = proseClassName,
}: {
  items: readonly string[];
  className?: string;
}) {
  return (
    <div className={className}>
      {items.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  );
}

function Section({
  id,
  title,
  titleClassName = headingClassName,
  children,
}: {
  id: string;
  title: string;
  titleClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-16 max-w-3xl sm:mt-20" aria-labelledby={id}>
      <h2 id={id} className={titleClassName}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function getScreenshot(id: AiMusicHubScreenshot["id"]): AiMusicHubScreenshot {
  const shot = AI_MUSIC_HUB_SCREENSHOTS.find((item) => item.id === id);
  if (!shot) {
    throw new Error(`Missing AI music hub screenshot: ${id}`);
  }
  return shot;
}

function LandingScreenshot({ shot }: { shot: AiMusicHubScreenshot }) {
  return (
    <figure className="mt-8">
      {shot.src ? (
        <Image
          src={shot.src}
          alt={shot.alt}
          width={shot.width}
          height={shot.height}
          className="h-auto w-full rounded-[20px] border border-[#e8def5] shadow-[0_12px_30px_rgba(90,60,145,0.08)]"
          sizes="(max-width: 768px) 100vw, 768px"
          loading="lazy"
        />
      ) : (
        <div
          className="flex w-full items-center justify-center rounded-[20px] border border-dashed border-[#d8c8ee] bg-[#faf7ff] px-5 text-center text-sm leading-6 text-[#7d70a2]"
          style={{ aspectRatio: `${shot.width} / ${shot.height}` }}
          role="img"
          aria-label={shot.alt}
        >
          Нужен скриншот реальной Студии АудиоЛада
        </div>
      )}
      <figcaption className="mt-3 text-sm leading-6 text-[#7d70a2]">
        {shot.caption}
      </figcaption>
    </figure>
  );
}

export default function AiMusicHubPageView() {
  const homeShot = getScreenshot("home");
  const productShot = getScreenshot("product");
  const studioShot = getScreenshot("studio");
  const authorShot = getScreenshot("author");

  return (
    <article className="pb-16 pt-4">
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

      <header className="mt-8 max-w-3xl sm:mt-10">
        <h1 className="text-[1.85rem] font-semibold leading-tight tracking-tight text-[#25135c] sm:text-4xl sm:leading-tight">
          {AI_MUSIC_HUB_PAGE_H1}
        </h1>
        <p className="mt-6 text-lg font-medium leading-8 text-[#25135c] sm:text-xl sm:leading-9">
          {AI_MUSIC_HUB_SUBTITLE}
        </p>
        <p className={`${proseClassName} max-w-2xl`}>{AI_MUSIC_HUB_INTRO}</p>
        <div className="mt-8">
          <AuthorRegistrationCta />
        </div>
      </header>

      <Section id="ai-music-what-is" title={AI_MUSIC_HUB_WHAT_IS_HEADING}>
        <Paragraphs items={AI_MUSIC_HUB_WHAT_IS_TEXT} />
        <LandingScreenshot shot={homeShot} />
      </Section>

      <Section
        id="ai-music-dual-income"
        title={AI_MUSIC_HUB_DUAL_INCOME_HEADING}
        titleClassName={thesisClassName}
      >
        <p className={`${proseClassName} text-lg font-medium text-[#25135c] sm:text-xl`}>
          {AI_MUSIC_HUB_DUAL_INCOME_LEAD}
        </p>

        <div className="mt-10">
          <h3 className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl">
            {AI_MUSIC_HUB_LISTENERS_HEADING}
          </h3>
          <Paragraphs items={AI_MUSIC_HUB_LISTENERS_TEXT} />
          <LandingScreenshot shot={productShot} />
        </div>

        <div className="mt-12">
          <h3 className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl">
            {AI_MUSIC_HUB_AUTHORS_HEADING}
          </h3>
          <Paragraphs items={AI_MUSIC_HUB_AUTHORS_TEXT} />
          <LandingScreenshot shot={studioShot} />
        </div>
      </Section>

      <section
        id="ai-music-dual-income-recap"
        className="mt-16 max-w-3xl scroll-mt-24 sm:mt-20"
        aria-labelledby="ai-music-dual-income-recap-heading"
      >
        <div className={highlightBlockClassName}>
          <h2
            id="ai-music-dual-income-recap-heading"
            className={thesisClassName}
          >
            {AI_MUSIC_HUB_DUAL_INCOME_RECAP_HEADING}
          </h2>
          <Paragraphs items={AI_MUSIC_HUB_DUAL_INCOME_RECAP_TEXT} />
        </div>
      </section>

      <Section id="ai-music-economics" title={AI_MUSIC_HUB_ECONOMICS_HEADING}>
        <p className={proseClassName}>{AI_MUSIC_HUB_ECONOMICS_INTRO}</p>
        <ul className="mt-7 grid list-none gap-3 p-0">
          {AI_MUSIC_HUB_ECONOMICS_ROWS.map((row) => (
            <li
              key={row.sales}
              className="flex flex-col gap-1 rounded-[20px] border border-[#d8c8ee] bg-[#faf7ff] px-5 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
            >
              <span className="text-base font-medium text-[#4a3d73] sm:text-lg">
                {row.sales}
              </span>
              <span className="text-2xl font-semibold tracking-tight text-[#25135c] sm:text-3xl">
                {row.amount}
              </span>
            </li>
          ))}
        </ul>
        <Paragraphs items={AI_MUSIC_HUB_ECONOMICS_TEXT} />
      </Section>

      <section
        id="ai-music-rights"
        className="mt-16 max-w-3xl scroll-mt-24 sm:mt-20"
        aria-labelledby="ai-music-rights-heading"
      >
        <div className={highlightBlockClassName}>
          <h2 id="ai-music-rights-heading" className={thesisClassName}>
            {AI_MUSIC_HUB_RIGHTS_HEADING}
          </h2>
          <Paragraphs items={AI_MUSIC_HUB_RIGHTS_TEXT} />
        </div>
      </section>

      <Section id="ai-music-steps" title={AI_MUSIC_HUB_STEPS_HEADING}>
        <p className={proseClassName}>{AI_MUSIC_HUB_STEPS_LEAD}</p>
        <p className="mt-5 rounded-[20px] border border-[#eadff8] bg-[#faf7ff] px-5 py-4 text-base font-medium leading-7 text-[#25135c] sm:text-[17px] sm:leading-8">
          {AI_MUSIC_HUB_STEPS_LINE}
        </p>
        <Paragraphs items={AI_MUSIC_HUB_STEPS_TEXT} />
      </Section>

      <Section
        id="ai-music-repeat"
        title={AI_MUSIC_HUB_REPEAT_HEADING}
        titleClassName={thesisClassName}
      >
        <Paragraphs items={AI_MUSIC_HUB_REPEAT_TEXT} />
        <LandingScreenshot shot={authorShot} />
      </Section>

      <Section
        id="ai-music-start-small"
        title={AI_MUSIC_HUB_START_SMALL_HEADING}
      >
        <Paragraphs items={AI_MUSIC_HUB_START_SMALL_TEXT} />
      </Section>

      <Section id="ai-music-suno" title={AI_MUSIC_HUB_SUNO_HEADING}>
        <Paragraphs items={AI_MUSIC_HUB_SUNO_TEXT} />
      </Section>

      <section
        className="mt-16 max-w-3xl rounded-[28px] border border-[#eadff8] bg-[#faf7ff] px-5 py-8 sm:mt-20 sm:px-7 sm:py-10"
        aria-labelledby="ai-music-final-cta-heading"
      >
        <h2
          id="ai-music-final-cta-heading"
          className="text-2xl font-semibold tracking-tight text-[#25135c] sm:text-3xl"
        >
          {AI_MUSIC_HUB_CLOSING_HEADING}
        </h2>
        <Paragraphs items={AI_MUSIC_HUB_CLOSING_TEXT} />
        <div className="mt-8">
          <AuthorRegistrationCta />
        </div>
        <p className="mt-5 text-sm leading-6 text-[#7d70a2]">
          {AI_MUSIC_HUB_CLOSING_NOTE}
        </p>
      </section>
    </article>
  );
}
