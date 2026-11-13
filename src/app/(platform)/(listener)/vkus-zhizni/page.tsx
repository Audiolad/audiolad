import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import {
  buildSiteCanonicalUrl,
  SITE_BRAND,
} from "@/lib/seo/public-page-metadata";

import {
  AUDIO_SPRINT_VKUS_ZHIZNI_QUERY_COUNT,
  AUDIO_SPRINT_VKUS_ZHIZNI_SLUG,
} from "@/lib/seo-queries/audio-sprint";

import VkusZhizniQueryList from "./QueryList";
import {
  BookIcon,
  CalendarIcon,
  CornerBouquet,
  CupIcon,
  GiftIcon,
  HeroDecor,
  LotusIcon,
  MoonIcon,
  NoteIcon,
  ParkIcon,
  SprigDivider,
  SunIcon,
} from "./decor";

/**
 * АудиоСпринт «Вкус жизни», 14–29 ноября 2026 (Company Core eb792a06).
 *
 * Separate page. The October sprint landing (/osen-zvuchit), its sprint and its data are not touched.
 * The approved query list (Core 976eabbc, t1427u) is shown from static page data; booking
 * happens in the author cabinet on the sprint vkus-zhizni-2026 (same mechanism as the
 * October sprint: up to 5 active reservations, 7 days each).
 */

const PAGE_PATH = "/vkus-zhizni";
const SPRINT_HREF = `/author-dashboard/audio-sprints/${AUDIO_SPRINT_VKUS_ZHIZNI_SLUG}`;
const PAGE_TITLE = "Вкус жизни – АудиоСпринт для авторов АудиоЛада";
const PAGE_DESCRIPTION =
  "«Вкус жизни» – АудиоСпринт для авторов АудиоЛада 14–29 ноября 2026 года: музыка и медитации по поисковым запросам Яндекса, призовой фонд 6 000 ₽.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: buildSiteCanonicalUrl(PAGE_PATH),
  },
  robots: {
    index: false,
    follow: true,
  },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: buildSiteCanonicalUrl(PAGE_PATH),
    type: "website",
    siteName: SITE_BRAND,
    locale: "ru_RU",
  },
  twitter: {
    card: "summary",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

const linkFocusClass =
  "focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

const primaryCtaClassName =
  `inline-flex min-h-12 items-center justify-center rounded-[24px] bg-[#7042c5] px-6 py-3 text-[16px] font-semibold text-white shadow-sm transition hover:bg-[#6338b0] ${linkFocusClass}`;

const headingClassName =
  "text-2xl font-semibold tracking-tight text-[#25135c] sm:text-3xl";

const proseClassName =
  "space-y-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8";

const cardClassName =
  "rounded-[24px] border border-[#e8def5] bg-white px-5 py-5 sm:px-6";

const moments = [
  "Представьте уютную кофейню. За окном неспешно течёт городская жизнь, а внутри звучит мягкий джаз, пахнет свежесваренным кофе, и никуда не хочется торопиться.",
  "Или прогулку по любимому парку. В наушниках играет красивая музыка, вокруг гуляют люди, и вы просто наслаждаетесь моментом.",
  "Или другое утро. Вы просыпаетесь, включаете любимую медитацию, настраиваетесь на новый день и чувствуете, как внутри появляется спокойствие и уверенность.",
  "А может быть, это вечер после насыщенного дня, когда хочется просто отдохнуть, послушать красивую музыку и побыть с собой.",
  "Из таких маленьких моментов и складывается наша жизнь. И каждый из нас, авторов АудиоЛада, может сделать эти моменты чуточку прекраснее.",
];

const momentIcons = [CupIcon, ParkIcon, SunIcon, MoonIcon];

const benefits = [
  "Новые идеи для творчества.",
  "Темы, основанные на реальных поисковых запросах.",
  "Возможность привлечь новых слушателей.",
  "Расширение каталога АудиоЛада.",
  "Творческий опыт и возможность участвовать в розыгрыше призового фонда.",
];

const steps = [
  "Выберите поисковый запрос в кабинете автора АудиоЛада, в разделе «Музыка» или «Медитации».",
  "Забронируйте выбранную тему. Можно держать до пяти броней одновременно. Каждая бронь действует семь дней, после чего неиспользованный запрос вновь становится доступным.",
  "Создайте тематический аудиопродукт. Для музыки – альбом; рекомендуем не менее десяти композиций, минимально пять. Для медитаций – одну полноценную, завершённую медитацию.",
  "Опубликуйте продукт на АудиоЛаде в сроки спринта, 14–29 ноября 2026 года, соблюдая требования к правам и оформлению.",
  "Участвуйте в подведении итогов и розыгрыше призового фонда.",
];

const conditions = [
  "продукт опубликован бесплатно;",
  "продукт отвечает выбранному поисковому запросу;",
  "продукт прошёл модерацию и опубликован в каталоге не позднее 29 ноября 2026 года включительно;",
  "оформление продукта полностью заполнено.",
];

const prizes = [
  ["1 место", "3 000 ₽"],
  ["2 место", "2 000 ₽"],
  ["3 место", "1 000 ₽"],
];


const RAFFLE_DATE = "30 ноября 2026 года";

/** Number of search queries at sprint start (approved list, t1427u). Edit in audio-sprint.ts. */
const SPRINT_START_QUERY_COUNT = AUDIO_SPRINT_VKUS_ZHIZNI_QUERY_COUNT;

const heroStats = [
  ["16 дней", "на создание и публикацию"],
  [`${SPRINT_START_QUERY_COUNT} запросов`, "на старте спринта"],
  ["6 000 ₽", "призовой фонд"],
];

const chances = [
  ["1 продукт", "1 шанс"],
  ["3 продукта", "3 шанса"],
  ["10 продуктов", "10 шансов"],
];

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
    <section id={id} className="mt-14 scroll-mt-24" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className={`${headingClassName} flex items-start gap-3`}>
        <span aria-hidden="true" className="mt-[0.6em] h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-br from-[#f2a7c0] to-[#7042c5]" />
        <span>{title}</span>
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function CtaButton() {
  return (
    <Link href={SPRINT_HREF} className={primaryCtaClassName}>
      Выбрать поисковый запрос
    </Link>
  );
}

export default function VkusZhizniPage() {
  return (
    <article className="relative overflow-hidden pb-16 pt-4">
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
            Вкус жизни
          </li>
        </ol>
      </nav>

      <header className="@container relative mt-6 overflow-hidden rounded-[32px] border border-[#eadff8] bg-gradient-to-br from-[#fdf6ff] via-[#fffaff] to-[#eef7f1] px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
        <HeroDecor className="pointer-events-none absolute right-6 top-8 hidden h-[280px] w-[340px] @3xl:block" />
        <div className="relative flow-root max-w-4xl @3xl:max-w-[56%]">
          <HeroDecor className="pointer-events-none float-right -mr-3 -mt-1 ml-2 h-28 w-36 @md:h-36 @md:w-44 @3xl:hidden" />
          <p className="inline-flex rounded-full border border-[#e2c8ff] bg-white/80 px-3 py-1.5 text-sm font-semibold text-[#7042c5]">
            14–29 ноября 2026 года
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-[#25135c] sm:text-5xl">
            Вкус жизни
          </h1>
          <p className="mt-3 text-xl font-medium text-[#4a3d73] sm:text-2xl">
            АудиоСпринт для авторов АудиоЛада
          </p>
          <p className="mt-5 max-w-3xl text-base leading-7 text-[#4a3d73] sm:text-lg sm:leading-8">
            Создаём музыку и аудиопрактики, которые наполняют повседневную жизнь
            красотой, спокойствием, вдохновением и удовольствием.
          </p>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[#4a3d73] sm:text-lg sm:leading-8">
            Выберите поисковый запрос Яндекса, создайте музыкальный альбом или
            медитацию, опубликуйте на АудиоЛаде.
          </p>
        </div>

        <div className="relative clear-both mt-7 grid max-w-3xl gap-2 @sm:grid-cols-3 @xl:gap-3">
          {heroStats.map(([value, label]) => (
            <div
              key={label}
              className="h-full rounded-[20px] border border-white/80 bg-white/80 px-3 py-3 shadow-sm @xl:px-4 @xl:py-4"
            >
              <p className="text-base font-semibold text-[#25135c] @xl:text-xl">{value}</p>
              <p className="mt-1 text-sm leading-5 text-[#7d70a2]">{label}</p>
            </div>
          ))}
        </div>

        <div className="relative mt-7">
          <CtaButton />
        </div>
      </header>

      <div className="@container max-w-4xl">
        <SprigDivider className="mx-auto mt-10 h-8 w-44" />
        <Section id="moments" title="У каждого момента жизни есть своё звучание">
          <ul className="grid gap-4 @xl:grid-cols-2">
            {moments.slice(0, 4).map((text, index) => {
              const Icon = momentIcons[index];
              return (
                <li key={text} className={`${cardClassName} flex gap-4`}>
                  <Icon className="h-11 w-11 shrink-0" />
                  <p className="text-[15px] leading-7 text-[#4a3d73] sm:text-base">{text}</p>
                </li>
              );
            })}
          </ul>
          <div className={`mt-6 ${proseClassName}`}>
            <p>{moments[4]}</p>
            <p className="text-lg font-semibold text-[#7042c5]">
              Именно этому посвящён наш новый АудиоСпринт – «Вкус жизни».
            </p>
          </div>
        </Section>

        <Section id="about" title="Что такое АудиоСпринт">
          <div className={proseClassName}>
            <p>
              «Вкус жизни» – 16 дней творчества для авторов АудиоЛада. Мы собрали
              реальные поисковые запросы Яндекса, чтобы вдохновить вас на новые
              музыкальные альбомы и медитации, которые люди уже ищут.
            </p>
            <p>
              Выбирайте понравившуюся тему, бронируйте запрос, создавайте продукт и
              публикуйте его на платформе.
            </p>
          </div>
          <div className="mt-6 grid gap-4 @xl:grid-cols-2">
            <div className={cardClassName}>
              <div className="flex items-center gap-3">
                <NoteIcon className="h-10 w-10 shrink-0" />
                <h3 className="text-lg font-semibold text-[#25135c]">Музыка</h3>
              </div>
              <p className="mt-2 text-[15px] leading-7 text-[#4a3d73] sm:text-base">
                Музыка для расслабления, джаз для кофеен, музыка для отдыха и
                приятных моментов жизни.
              </p>
            </div>
            <div className={cardClassName}>
              <div className="flex items-center gap-3">
                <LotusIcon className="h-10 w-10 shrink-0" />
                <h3 className="text-lg font-semibold text-[#25135c]">Медитации</h3>
              </div>
              <p className="mt-2 text-[15px] leading-7 text-[#4a3d73] sm:text-base">
                Радость, спокойствие, вдохновение, благодарность, принятие себя,
                отдых, гармония – каждая практика помогает слушателю уделить время
                себе.
              </p>
            </div>
          </div>
        </Section>

        <Section id="why" title="Зачем участвовать">
          <ul className="grid gap-3 @xl:grid-cols-2">
            {benefits.map((item) => (
              <li key={item} className={`${cardClassName} flex gap-3 text-[15px] leading-7 text-[#4a3d73] sm:text-base`}>
                <span aria-hidden="true" className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-[#8cc4a4]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="how" title="Как участвовать">
          <ol className="grid gap-4">
            {steps.map((text, index) => (
              <li key={text} className={cardClassName}>
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f1e9fb] text-sm font-bold text-[#7042c5]">
                    {index + 1}
                  </span>
                  <p className="pt-1.5 text-[15px] leading-7 text-[#4a3d73] sm:text-base">
                    {text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="queries" title="Поисковые запросы">
          <div className={proseClassName}>
            <p>Выберите направление: «Музыка» или «Медитации».</p>
          </div>
          <div className="mt-5">
            <VkusZhizniQueryList bookingHref={SPRINT_HREF} />
          </div>
        </Section>

        <Section id="conditions" title="Условия участия">
          <ul className={`${cardClassName} space-y-3 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8`}>
            {conditions.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden="true" className="mt-0.5 font-bold text-[#7042c5]">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-7">
            <h3 className="text-xl font-semibold text-[#25135c]">
              Каждый продукт – отдельный шанс
            </h3>
            <p className="mt-3 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
              Количество продуктов от одного автора не ограничено. Каждый
              опубликованный по правилам спринта продукт даёт один отдельный шанс
              в розыгрыше.
            </p>
            <div className="mt-5 grid gap-3 @md:grid-cols-3">
              {chances.map(([products, chance]) => (
                <div key={products} className={cardClassName}>
                  <p className="text-base font-medium text-[#7d70a2]">{products}</p>
                  <p className="mt-1 text-2xl font-semibold text-[#25135c]">{chance}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm leading-6 text-[#7d70a2]">
              Ограничение «до 5» относится только к количеству поисковых
              запросов, которые можно одновременно держать в брони.
            </p>
          </div>
        </Section>

        <Section id="full-products" title="Создавайте полноценные аудиопродукты">
          <div className={proseClassName}>
            <p>
              Если вы создаёте музыку, рекомендуем подготовить полноценный
              тематический альбом из 10 и более композиций. Пусть слушатель сможет
              погрузиться в выбранную атмосферу и наслаждаться вашей музыкой
              продолжительное время. (Минимальный рекомендуемый объём – 5
              композиций.)
            </p>
            <p>Для медитаций достаточно одной законченной аудиопрактики.</p>
          </div>
        </Section>

        <section
          id="prizes"
          className="relative mt-14 scroll-mt-24 overflow-hidden rounded-[30px] border border-[#eadff8] bg-gradient-to-br from-[#f8f2ff] to-[#eef7f1] px-5 py-7 sm:px-7 sm:py-8"
          aria-labelledby="prizes-heading"
        >
          <CornerBouquet className="pointer-events-none absolute right-2 top-2 h-20 w-24 opacity-70 sm:right-4 sm:top-3 sm:h-28 sm:w-32" />
          <p className="relative text-sm font-semibold uppercase tracking-[0.16em] text-[#8b65c7]">
            Призовой фонд – 6 000 ₽
          </p>
          <h2 id="prizes-heading" className="relative mt-2 text-2xl font-semibold tracking-tight text-[#25135c] sm:text-3xl">
            Три денежных приза
          </h2>
          <p className="relative mt-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            После завершения «Вкус жизни» мы проведём розыгрыш среди всех
            продуктов, которые выполнили условия участия.
          </p>

          <div className="relative mt-6 grid gap-3 @md:grid-cols-3">
            {prizes.map(([place, amount], index) => (
              <div
                key={place}
                className="rounded-[22px] border border-white bg-white/85 px-5 py-6 text-center shadow-sm"
              >
                <GiftIcon tone={index} className="mx-auto mb-3 h-14 w-14" />
                <p className="text-sm font-semibold text-[#7d70a2]">{place}</p>
                <p className="mt-1 text-3xl font-semibold text-[#7042c5]">{amount}</p>
              </div>
            ))}
          </div>

          <div className="relative mt-6 space-y-3 text-[15px] leading-7 text-[#4a3d73] sm:text-base">
            <p>
              Один автор может получить <strong className="text-[#25135c]">не более одного денежного
              приза</strong>.
            </p>
            <p>
              Если один и тот же автор выпадет в розыгрыше повторно,
              соответствующий приз будет разыгран ещё раз среди остальных
              участников.
            </p>
          </div>

          <div className="relative mt-6 rounded-[20px] bg-[#25135c] px-5 py-4 text-white">
            <p className="text-sm text-white/75">Розыгрыш состоится</p>
            <p className="mt-1 text-xl font-semibold">{RAFFLE_DATE}</p>
          </div>
        </section>

        <div className="mt-14 grid gap-4 @xl:grid-cols-2">
          <section id="who" className={`${cardClassName} scroll-mt-24`} aria-labelledby="who-heading">
            <BookIcon className="h-11 w-11" />
            <h2 id="who-heading" className="mt-3 text-xl font-semibold text-[#25135c]">
              Кто может участвовать
            </h2>
            <p className="mt-2 text-[15px] leading-7 text-[#4a3d73] sm:text-base">
              Действующие авторы АудиоЛада. Участие предполагает создание и
              публикацию авторского аудиопродукта.
            </p>
          </section>
          <section id="when" className={`${cardClassName} scroll-mt-24`} aria-labelledby="when-heading">
            <CalendarIcon className="h-11 w-11" />
            <h2 id="when-heading" className="mt-3 text-xl font-semibold text-[#25135c]">
              Когда проходит
            </h2>
            <p className="mt-2 text-[15px] leading-7 text-[#4a3d73] sm:text-base">
              14–29 ноября 2026 года. 16 дней для творчества и публикации.
            </p>
          </section>
        </div>

        <SprigDivider className="mx-auto mt-12 h-8 w-44" />

        <section
          className="relative mt-8 overflow-hidden rounded-[30px] border border-[#e4d5f6] bg-gradient-to-br from-[#faf7ff] to-[#fff6ee] px-5 py-8 sm:px-7 sm:py-9"
          aria-labelledby="final-cta-heading"
        >
          <CornerBouquet className="pointer-events-none absolute -bottom-4 -right-4 h-24 w-28 rotate-180 opacity-60 sm:h-32 sm:w-36" />
          <p className="text-sm font-semibold text-[#7042c5]">14–29 ноября 2026 года</p>
          <h2
            id="final-cta-heading"
            className="mt-2 text-3xl font-semibold tracking-tight text-[#25135c]"
          >
            Присоединяйтесь
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            Выберите тему, которая вдохновляет именно вас, и создайте аудио,
            которое сделает чей-то день немного прекраснее.
          </p>
          <p className="mt-4 text-lg font-semibold text-[#25135c]">
            Давайте вместе наполним жизнь красивым звучанием!
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-[#4a3d73]">
            <span>«Музыка» и «Медитации»</span>
            <span>Призовой фонд – 6 000 ₽</span>
            <span>Розыгрыш – {RAFFLE_DATE}</span>
          </div>
          <div className="mt-7">
            <CtaButton />
          </div>
          <p className="mt-7 text-sm font-semibold text-[#7042c5]">
            АудиоЛад – пусть жизнь звучит красиво!
          </p>
        </section>
      </div>
    </article>
  );
}
