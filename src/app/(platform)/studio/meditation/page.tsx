import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import AudioladHorizontalLogo from "@/components/brand/AudioladHorizontalLogo";
import { buildStudioMeditationMetadata } from "@/lib/seo/public-page-metadata";
import {
  STUDIO_MEDITATION_AUDIENCES,
  STUDIO_MEDITATION_FEATURES,
  STUDIO_MEDITATION_PAGE_H1,
  STUDIO_MEDITATION_STEPS,
} from "@/lib/seo/studio-meditation/content";

export function generateMetadata(): Metadata {
  return buildStudioMeditationMetadata();
}

const sectionHeadingClassName =
  "text-3xl font-semibold tracking-[-0.035em] text-[#25135c] sm:text-4xl lg:text-5xl";

const bodyClassName =
  "mt-5 max-w-2xl text-[17px] leading-8 text-[#4c3d78] sm:text-lg sm:leading-8";

const productEpisodes = [
  {
    kicker: "01 - Голос",
    title: "Начните с того, что хотите сказать",
    featureIndexes: [0, 5],
    icon: "microphone",
  },
  {
    kicker: "02 - Голос и музыка",
    title: "Создайте спокойное, поддерживающее звучание",
    featureIndexes: [1, 3],
    icon: "audio",
  },
  {
    kicker: "03 - Монтаж",
    title: "Соберите запись в нужном ритме",
    featureIndexes: [2, 4],
    icon: "edit",
  },
] as const;

function FeatureIcon({
  kind,
}: {
  kind: (typeof productEpisodes)[number]["icon"];
}) {
  const commonProps = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.7,
  };

  if (kind === "microphone") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...commonProps}>
        <rect x="8.25" y="3" width="7.5" height="12" rx="3.75" />
        <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" />
      </svg>
    );
  }

  if (kind === "audio") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...commonProps}>
        <path d="M5 15V9M9 18V6M13 15v-6M17 20V4M21 15V9" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...commonProps}>
      <path d="m5 7 14 10M19 7 5 17M9 5l6 14" />
      <circle cx="6" cy="6" r="2.25" />
      <circle cx="18" cy="18" r="2.25" />
    </svg>
  );
}

export default function StudioMeditationPage() {
  return (
    <main className="min-h-screen scroll-smooth overflow-hidden bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto w-full max-w-[1050px] px-5 pb-24 pt-5 sm:px-8 sm:pt-7 lg:px-10 lg:pb-32">
        <header className="flex items-center justify-between gap-4 border-b border-[#e6dbf5] pb-4 sm:pb-5">
          <AudioladHorizontalLogo
            priority
            className="h-9 w-auto object-contain object-left sm:h-10"
            linkClassName="inline-flex shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            sizes="160px"
          />
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden font-medium text-[#6f61a3] sm:inline">
              Студия
            </span>
            <Link
              href="/"
              className="rounded-full border border-[#d9caec] bg-white px-3 py-2 font-medium text-[#4c3d78] transition hover:border-[#a88cce] hover:text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              В АудиоЛад
            </Link>
          </div>
        </header>

        <section className="py-10 text-center sm:py-12 lg:py-14">
          <div className="mx-auto max-w-[880px]">
            <p className="text-xs font-semibold tracking-[0.16em] text-[#7042c5]">
              СТУДИЯ АУДИОЛАД
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-[#25135c] sm:text-5xl sm:leading-[1.06] lg:text-6xl lg:leading-[1.04] xl:text-[68px]">
              {STUDIO_MEDITATION_PAGE_H1}
            </h1>
            <p className="mx-auto mt-5 max-w-[760px] text-[17px] leading-8 text-[#4c3d78] sm:text-lg sm:leading-8">
              Запишите или загрузите голос, добавьте музыку, настройте звучание
              и соберите свою медитацию прямо в браузере - без сложных программ
              для работы со звуком.
            </p>
            <a
              href="#studio-meditation-features"
              className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[#7042c5] px-6 py-3 text-[16px] font-semibold text-white shadow-[0_12px_28px_rgba(112,66,197,0.24)] transition hover:bg-[#6338b0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              Посмотреть возможности
            </a>
            <p className="mt-3 text-sm leading-6 text-[#796ba0]">
              Бесплатный режим без регистрации скоро появится.
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-[1024px] sm:mt-10">
            <div className="aspect-[1.35] overflow-hidden rounded-[18px] shadow-[0_18px_42px_rgba(28,14,61,0.16)] sm:rounded-[22px] md:aspect-auto">
              <Image
                src="/images/studio/studio-interface.png"
                alt="Интерфейс Студии АудиоЛад для записи медитаций"
                width={1024}
                height={547}
                priority
                sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1099px) calc(100vw - 80px), 1024px"
                className="h-full w-full object-cover object-[54%_50%] md:h-auto"
              />
            </div>
          </div>
        </section>

        <section
          id="studio-meditation-features"
          className="mx-auto max-w-[900px] scroll-mt-8 border-t border-[#e6dbf5] py-16 sm:py-20 lg:py-24"
          aria-labelledby="studio-meditation-features-heading"
        >
          <div className="max-w-2xl">
            <h2
              id="studio-meditation-features-heading"
              className={sectionHeadingClassName}
            >
              Голос, музыка и монтаж - в одной Студии
            </h2>
            <p className={bodyClassName}>
              Всё необходимое, чтобы превратить записанный голос в готовую
              медитацию или аудиопрактику.
            </p>
          </div>

          <div className="mt-10 grid border-t border-[#dccdee] lg:mt-14 lg:grid-cols-3">
            {productEpisodes.map((episode) => (
              <article
                key={episode.title}
                className="border-b border-[#dccdee] py-8 lg:border-b-0 lg:border-r lg:px-8 lg:py-3 first:lg:pl-0 last:lg:border-r-0 last:lg:pr-0"
              >
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eee5f8] p-2.5 text-[#7042c5]">
                  <FeatureIcon kind={episode.icon} />
                </span>
                <p className="mt-5 text-xs font-semibold tracking-[0.14em] text-[#7042c5]">
                  {episode.kicker}
                </p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#25135c]">
                  {episode.title}
                </h3>
                <dl className="mt-7 space-y-6">
                  {episode.featureIndexes.map((featureIndex) => {
                    const feature = STUDIO_MEDITATION_FEATURES[featureIndex];

                    return (
                      <div key={feature.title}>
                        <dt className="text-base font-semibold text-[#25135c]">
                          {feature.title}
                        </dt>
                        <dd className="mt-2 text-[15px] leading-6 text-[#5a4c7e]">
                          {feature.description}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section
          className="mx-auto max-w-[900px] border-t border-[#e6dbf5] py-16 sm:py-20 lg:py-24"
          aria-labelledby="studio-meditation-process-heading"
        >
          <div className="flex max-w-2xl flex-col gap-5">
            <h2
              id="studio-meditation-process-heading"
              className={sectionHeadingClassName}
            >
              Как создать свою медитацию
            </h2>
          </div>
          <ol className="mt-10 grid gap-0 border-y border-[#dccdee] lg:mt-14 lg:grid-cols-4">
            {STUDIO_MEDITATION_STEPS.map((step, index) => (
              <li
                key={step.number}
                className="relative border-b border-[#dccdee] py-7 last:border-b-0 lg:border-b-0 lg:border-r lg:px-6 lg:py-8 first:lg:pl-0 last:lg:border-r-0 last:lg:pr-0"
              >
                <p className="text-sm font-semibold text-[#7042c5]">
                  {step.number}
                </p>
                <h3 className="mt-3 text-xl font-semibold tracking-[-0.025em] text-[#25135c]">
                  {step.title}
                </h3>
                <p className="mt-3 text-[15px] leading-6 text-[#5a4c7e]">
                  {step.description}
                </p>
                {index < STUDIO_MEDITATION_STEPS.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-0 top-8 hidden translate-x-1/2 rounded-full bg-[#f7f2fc] px-1 text-sm text-[#9d85c2] lg:block"
                  >
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-[900px] border-t border-[#e6dbf5] py-16 sm:py-20 lg:py-28">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-semibold tracking-[0.16em] text-[#7042c5]">
              ПРОСТОЙ СЦЕНАРИЙ
            </p>
            <h2 className={`mt-4 ${sectionHeadingClassName}`}>
              Создано специально для медитаций и аудиопрактик
            </h2>
            <p className="mx-auto mt-6 max-w-3xl text-[17px] leading-8 text-[#4c3d78] sm:text-lg">
              Чтобы записать хорошую медитацию, не обязательно изучать
              профессиональные программы с десятками панелей, инструментов и
              технических настроек.
            </p>
            <p className="mx-auto mt-5 max-w-3xl text-[17px] leading-8 text-[#4c3d78] sm:text-lg">
              Студия АудиоЛад строится вокруг простого сценария:
            </p>
            <p className="mt-9 text-2xl font-semibold tracking-[-0.04em] text-[#7042c5] sm:text-3xl lg:text-4xl">
              Голос <span aria-hidden="true">→</span> Музыка{" "}
              <span aria-hidden="true">→</span> Монтаж{" "}
              <span aria-hidden="true">→</span> Готовая медитация
            </p>
            <p className="mx-auto mt-9 max-w-3xl text-[17px] leading-8 text-[#4c3d78] sm:text-lg">
              Перед вами инструменты, которые действительно нужны для создания
              голосовых аудиопрактик. И всё работает прямо в браузере.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[900px] border-t border-[#e6dbf5] py-16 sm:py-20 lg:py-24">
          <div className="rounded-[28px] border border-[#d8c8ee] bg-white px-6 py-9 sm:px-10 sm:py-12 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:gap-12">
            <div>
              <h2 className={sectionHeadingClassName}>
                Попробуйте весь процесс сами
              </h2>
              <p className={bodyClassName}>
                Мы готовим бесплатный гостевой режим Студии АудиоЛад.
              </p>
              <p className="mt-4 text-[17px] leading-8 text-[#4c3d78] sm:text-lg">
                Вы сможете открыть Студию без регистрации, записать голос,
                добавить музыку, попробовать монтаж и создать свою первую
                медитацию.
              </p>
              <p className="mt-4 text-[17px] leading-8 text-[#4c3d78] sm:text-lg">
                После запуска бесплатного режима первый проект можно будет
                пройти от начала до готового результата прямо в браузере.
              </p>
            </div>
            <div className="mt-8 lg:mt-0 lg:justify-self-end">
              <span className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#cbb8e3] bg-[#f7f2fc] px-6 py-3 text-[16px] font-semibold text-[#6f519a]">
                Бесплатный режим скоро
              </span>
            </div>
          </div>
        </section>

        <section
          className="mx-auto max-w-[900px] border-t border-[#e6dbf5] py-16 sm:py-20 lg:py-24"
          aria-labelledby="studio-meditation-audience-heading"
        >
          <div className="max-w-2xl">
            <h2
              id="studio-meditation-audience-heading"
              className={sectionHeadingClassName}
            >
              Для тех, кто создаёт через голос
            </h2>
          </div>
          <ul className="mt-10 grid gap-x-10 border-t border-[#dccdee] sm:grid-cols-2 lg:mt-14 lg:grid-cols-3">
            {STUDIO_MEDITATION_AUDIENCES.map((audience) => (
              <li
                key={audience.title}
                className="border-b border-[#dccdee] py-6 lg:py-7"
              >
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#25135c]">
                  {audience.title}
                </h3>
                <p className="mt-3 text-[15px] leading-6 text-[#5a4c7e]">
                  {audience.description}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-[900px] border-t border-[#e6dbf5] pt-16 text-center sm:pt-20 lg:pt-24">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-4xl font-semibold tracking-[-0.045em] text-[#25135c] sm:text-5xl lg:text-6xl">
              Создайте свою первую медитацию в АудиоЛаде
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-8 text-[#4c3d78] sm:text-lg">
              Запишите голос, добавьте музыку и соберите аудиопрактику в одном
              удобном пространстве.
            </p>
            <span className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[#e9ddf7] px-6 py-3 text-[16px] font-semibold text-[#65438d]">
              Бесплатный режим Студии скоро откроется
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
