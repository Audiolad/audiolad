import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import MeditationAuthorsBenefitsSlider from "@/components/meditation-authors-landing/MeditationAuthorsBenefitsSlider";
import {
  MEDITATION_AUTHORS_LANDING_BENEFITS_HEADING,
  MEDITATION_AUTHORS_LANDING_BREADCRUMB_TITLE,
  MEDITATION_AUTHORS_LANDING_FINAL_HEADING,
  MEDITATION_AUTHORS_LANDING_FINAL_TEXT,
  MEDITATION_AUTHORS_LANDING_INTRO_HEADING,
  MEDITATION_AUTHORS_LANDING_INTRO_TEXT,
  MEDITATION_AUTHORS_LANDING_MONETIZATION_CARDS,
  MEDITATION_AUTHORS_LANDING_MONETIZATION_HEADING,
  MEDITATION_AUTHORS_LANDING_MONETIZATION_TEXT,
  MEDITATION_AUTHORS_LANDING_PAGE_H1,
  MEDITATION_AUTHORS_LANDING_PRIMARY_CTA,
  MEDITATION_AUTHORS_LANDING_SEARCH_CLOSING,
  MEDITATION_AUTHORS_LANDING_SEARCH_HEADING,
  MEDITATION_AUTHORS_LANDING_SEARCH_LEAD,
  MEDITATION_AUTHORS_LANDING_SEARCH_TEXT,
  MEDITATION_AUTHORS_LANDING_SECONDARY_CTA,
  MEDITATION_AUTHORS_LANDING_SPACE_HEADING,
  MEDITATION_AUTHORS_LANDING_SPACE_TEXT,
  MEDITATION_AUTHORS_LANDING_STEPS,
  MEDITATION_AUTHORS_LANDING_STEPS_HEADING,
  MEDITATION_AUTHORS_LANDING_STUDIO_HEADING,
  MEDITATION_AUTHORS_LANDING_STUDIO_HREF,
  MEDITATION_AUTHORS_LANDING_STUDIO_TEXT,
  MEDITATION_AUTHORS_LANDING_SUBTITLE,
  MEDITATION_AUTHORS_LANDING_VISUALS,
  type MeditationAuthorsVisual,
} from "@/lib/seo/meditation-authors-landing";
import { BECOME_AUTHOR_HREF } from "@/lib/profile/constants";

import "./meditation-authors-landing.css";

const linkFocusClass =
  "focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

const proseClassName =
  "mt-5 space-y-5 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8";

const headingClassName =
  "scroll-mt-24 text-2xl font-semibold tracking-tight text-[#25135c] sm:text-3xl";

const primaryCtaClassName = `mal-cta-primary inline-flex min-h-12 w-full max-w-full items-center justify-center rounded-[22px] bg-[#7042c5] px-5 py-3 text-center text-[16px] font-medium leading-6 text-white hover:bg-[#6338b0] sm:w-auto sm:px-6 ${linkFocusClass}`;

const secondaryCtaClassName = `inline-flex min-h-12 w-full max-w-full items-center justify-center rounded-[22px] border border-[#c9b5e8] bg-white px-5 py-3 text-center text-[16px] font-medium leading-6 text-[#7042c5] hover:bg-[#faf7ff] sm:w-auto sm:px-6 ${linkFocusClass}`;

function getVisual(id: MeditationAuthorsVisual["id"]): MeditationAuthorsVisual {
  const visual = MEDITATION_AUTHORS_LANDING_VISUALS.find((item) => item.id === id);
  if (!visual) {
    throw new Error(`Missing meditation authors landing visual: ${id}`);
  }
  return visual;
}

function VisualSlot({
  visual,
  priority = false,
  className = "",
}: {
  visual: MeditationAuthorsVisual;
  priority?: boolean;
  className?: string;
}) {
  const frameClassName = `overflow-hidden rounded-[28px] border border-[#e8def5] bg-[#faf7ff] shadow-[0_16px_40px_rgba(90,60,145,0.08)] ${className}`;

  if (visual.src) {
    return (
      <figure className={frameClassName}>
        <Image
          src={visual.src}
          alt={visual.alt}
          width={visual.width}
          height={visual.height}
          className="h-auto w-full object-cover"
          sizes="(max-width: 1023px) 100vw, 52vw"
          priority={priority}
          loading={priority ? undefined : "lazy"}
        />
      </figure>
    );
  }

  return (
    <figure className={frameClassName}>
      <div
        className="flex w-full items-center justify-center bg-gradient-to-br from-[#fffaff] via-[#f7f2ff] to-[#efe6f8] px-6 text-center text-sm leading-6 text-[#7d70a2] sm:text-base sm:leading-7"
        style={{ aspectRatio: `${visual.width} / ${visual.height}` }}
        role="img"
        aria-label={visual.alt}
        data-mal-visual-slot={visual.id}
      >
        {visual.placeholderLabel}
      </div>
    </figure>
  );
}

function Paragraphs({ items }: { items: readonly string[] }) {
  return (
    <div className={proseClassName}>
      {items.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  );
}

function PrimaryCta() {
  return (
    <Link href={BECOME_AUTHOR_HREF} className={primaryCtaClassName}>
      {MEDITATION_AUTHORS_LANDING_PRIMARY_CTA}
    </Link>
  );
}

function SecondaryCta() {
  return (
    <Link href={MEDITATION_AUTHORS_LANDING_STUDIO_HREF} className={secondaryCtaClassName}>
      {MEDITATION_AUTHORS_LANDING_SECONDARY_CTA}
    </Link>
  );
}

function CtaRow({
  showSecondary = false,
}: {
  showSecondary?: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <PrimaryCta />
      {showSecondary ? <SecondaryCta /> : null}
    </div>
  );
}

function Section({
  id,
  title,
  children,
  className = "",
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`mt-16 scroll-mt-24 sm:mt-20 ${className}`}
      aria-labelledby={`${id}-heading`}
    >
      <h2 id={`${id}-heading`} className={headingClassName}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function StepIcon({ index }: { index: number }) {
  return (
    <span
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#efe4fb] to-[#e0d0f5] text-base font-semibold text-[#7042c5]"
      aria-hidden="true"
    >
      {index}
    </span>
  );
}

export default function MeditationAuthorsLandingPageView() {
  const hero = getVisual("hero");
  const studio = getVisual("studio");
  const authorSpace = getVisual("author-space");
  const listenerIntro = getVisual("listener-intro");
  const searchFunnel = getVisual("search-funnel");
  const finalCta = getVisual("final-cta");

  return (
    <article className="pb-16 pt-4" data-meditation-authors-landing>
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
            {MEDITATION_AUTHORS_LANDING_BREADCRUMB_TITLE}
          </li>
        </ol>
      </nav>

      {/* Block 1 — Hero */}
      <header className="mt-8 grid items-center gap-8 lg:mt-10 lg:grid-cols-2 lg:gap-12 xl:gap-16">
        <div className="order-2 lg:order-1">
          <VisualSlot visual={hero} priority className="mx-auto max-w-xl lg:max-w-none" />
        </div>

        <div className="order-1 lg:order-2">
          <h1 className="text-[1.85rem] font-semibold leading-tight tracking-tight text-[#25135c] sm:text-4xl sm:leading-tight">
            {MEDITATION_AUTHORS_LANDING_PAGE_H1}
          </h1>
          <p className="mt-5 text-base leading-7 text-[#4a3d73] sm:mt-6 sm:text-lg sm:leading-8">
            {MEDITATION_AUTHORS_LANDING_SUBTITLE}
          </p>
          <div className="mt-8">
            <CtaRow showSecondary />
          </div>
        </div>
      </header>

      {/* Block 2 — Benefits slider */}
      <Section id="mal-benefits" title={MEDITATION_AUTHORS_LANDING_BENEFITS_HEADING}>
        <div className="mt-8">
          <MeditationAuthorsBenefitsSlider />
        </div>
        <div className="mt-10">
          <CtaRow />
        </div>
      </Section>

      {/* Block 3 — Studio */}
      <Section id="mal-studio" title={MEDITATION_AUTHORS_LANDING_STUDIO_HEADING}>
        <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <Paragraphs items={MEDITATION_AUTHORS_LANDING_STUDIO_TEXT} />
            <div className="mt-8">
              <SecondaryCta />
            </div>
          </div>
          <VisualSlot visual={studio} />
        </div>
      </Section>

      {/* Block 4 — Author space */}
      <Section id="mal-author-space" title={MEDITATION_AUTHORS_LANDING_SPACE_HEADING}>
        <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
          <Paragraphs items={MEDITATION_AUTHORS_LANDING_SPACE_TEXT} />
          <VisualSlot visual={authorSpace} />
        </div>
      </Section>

      {/* Block 5 — Listener intro */}
      <Section id="mal-listener-intro" title={MEDITATION_AUTHORS_LANDING_INTRO_HEADING}>
        <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <Paragraphs items={MEDITATION_AUTHORS_LANDING_INTRO_TEXT} />
            <div className="mt-8">
              <CtaRow />
            </div>
          </div>
          <VisualSlot visual={listenerIntro} />
        </div>
      </Section>

      {/* Block 6 — Search / Yandex & Google */}
      <Section id="mal-search" title={MEDITATION_AUTHORS_LANDING_SEARCH_HEADING}>
        <p className="mt-5 text-lg font-medium leading-8 text-[#25135c] sm:text-xl sm:leading-9">
          {MEDITATION_AUTHORS_LANDING_SEARCH_LEAD}
        </p>
        <div className="mt-6 grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <Paragraphs items={MEDITATION_AUTHORS_LANDING_SEARCH_TEXT} />
            <p className="mt-6 rounded-[24px] border border-[#d8c8ee] bg-gradient-to-br from-[#fffaff] to-[#efe4fb] px-5 py-5 text-base font-medium leading-7 text-[#25135c] sm:px-6 sm:text-[17px] sm:leading-8">
              {MEDITATION_AUTHORS_LANDING_SEARCH_CLOSING}
            </p>
          </div>
          <VisualSlot visual={searchFunnel} />
        </div>
      </Section>

      {/* Block 7 — Monetization */}
      <Section
        id="mal-monetization"
        title={MEDITATION_AUTHORS_LANDING_MONETIZATION_HEADING}
      >
        <Paragraphs items={MEDITATION_AUTHORS_LANDING_MONETIZATION_TEXT} />
        <ul className="mt-8 grid list-none gap-4 p-0 sm:grid-cols-3">
          {MEDITATION_AUTHORS_LANDING_MONETIZATION_CARDS.map((card) => (
            <li
              key={card.id}
              className="rounded-[24px] border border-[#e8def5] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(90,60,145,0.05)]"
              data-mal-monetization-card={card.id}
            >
              <div
                className="mb-4 flex aspect-[4/3] items-center justify-center rounded-[18px] border border-dashed border-[#d8c8ee] bg-[#faf7ff] px-3 text-center text-xs leading-5 text-[#7d70a2]"
                role="img"
                aria-label={`Визуал: ${card.title}`}
              >
                Слот: {card.title}
              </div>
              <h3 className="text-lg font-semibold tracking-tight text-[#25135c]">
                {card.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#4a3d73]">{card.hint}</p>
            </li>
          ))}
        </ul>
        <div className="mt-10">
          <CtaRow />
        </div>
      </Section>

      {/* Block 8 — How to start */}
      <Section id="mal-steps" title={MEDITATION_AUTHORS_LANDING_STEPS_HEADING}>
        <ol className="mt-8 grid list-none gap-4 p-0 sm:grid-cols-2">
          {MEDITATION_AUTHORS_LANDING_STEPS.map((step, index) => (
            <li
              key={step.id}
              className="flex gap-4 rounded-[24px] border border-[#e8def5] bg-gradient-to-br from-white to-[#faf7ff] px-5 py-5"
            >
              <StepIcon index={index + 1} />
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-[#25135c]">
                  {step.title}
                </h3>
                <p className="mt-2 text-base leading-7 text-[#4a3d73]">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* Block 9 — Final CTA */}
      <section
        id="mal-final-cta"
        className="mt-16 scroll-mt-24 rounded-[32px] border border-[#eadff8] bg-gradient-to-br from-[#fffaff] via-[#faf7ff] to-[#efe4fb] px-5 py-8 sm:mt-20 sm:px-8 sm:py-12"
        aria-labelledby="mal-final-cta-heading"
      >
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <h2
              id="mal-final-cta-heading"
              className="text-2xl font-semibold tracking-tight text-[#25135c] sm:text-3xl"
            >
              {MEDITATION_AUTHORS_LANDING_FINAL_HEADING}
            </h2>
            <Paragraphs items={MEDITATION_AUTHORS_LANDING_FINAL_TEXT} />
            <div className="mt-8">
              <CtaRow />
            </div>
          </div>
          <VisualSlot visual={finalCta} />
        </div>
      </section>
    </article>
  );
}
