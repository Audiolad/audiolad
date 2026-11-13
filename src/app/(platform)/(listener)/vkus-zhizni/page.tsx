import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import {
  buildSiteCanonicalUrl,
  SITE_BRAND,
} from "@/lib/seo/public-page-metadata";

/**
 * АудиоСпринт «Вкус жизни», 14–29 ноября 2026 (Company Core eb792a06).
 *
 * Separate page. The October sprint landing (/osen-zvuchit), its sprint and its data are not touched.
 * The query list comes from Core task 976eabbc and is shown only after the owner
 * approves it. Until then the list block shows «Список готовится» and no booking
 * is imitated.
 */

const PAGE_PATH = "/vkus-zhizni";
const QUERIES_ANCHOR = "#queries";
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

const directions = ["Музыка", "Медитации"];

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
      <h2 id={`${id}-heading`} className={headingClassName}>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function CtaButton() {
  return (
    <Link href={QUERIES_ANCHOR} className={primaryCtaClassName}>
      Выбрать поисковый запрос
    </Link>
  );
}

export default function VkusZhizniPage() {
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
          <li className="text-[#25135c]" aria-current="page">
            Вкус жизни
          </li>
        </ol>
      </nav>

      <header className="mt-6 overflow-hidden rounded-[32px] border border-[#eadff8] bg-gradient-to-br from-[#fdf6ff] via-[#fffaff] to-[#f2e8ff] px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
        <div className="max-w-4xl">
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

          <div className="mt-7 grid max-w-3xl gap-3 sm:grid-cols-3">
            {[
              ["16 дней", ""],
              ["2 направления", ""],
              ["6 000 ₽", "призовой фонд"],
            ].map(([value, label]) => (
              <div
                key={value}
                className="rounded-[20px] border border-white/80 bg-white/80 px-4 py-4 shadow-sm"
              >
                <p className="text-xl font-semibold text-[#25135c]">{value}</p>
                {label ? (
                  <p className="mt-1 text-sm leading-5 text-[#7d70a2]">{label}</p>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-7">
            <CtaButton />
          </div>
        </div>
      </header>

      <div className="max-w-4xl">
        <Section id="moments" title="У каждого момента жизни есть своё звучание">
          <div className={proseClassName}>
            {moments.map((text) => (
              <p key={text}>{text}</p>
            ))}
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
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className={cardClassName}>
              <h3 className="text-lg font-semibold text-[#25135c]">Музыка</h3>
              <p className="mt-2 text-[15px] leading-7 text-[#4a3d73] sm:text-base">
                Джаз для кофеен, французские мелодии, аргентинское танго,
                инструментальная музыка для отдыха и другие направления. Можно
                использовать ранее созданную собственную музыку при наличии всех
                необходимых прав.
              </p>
            </div>
            <div className={cardClassName}>
              <h3 className="text-lg font-semibold text-[#25135c]">Медитации</h3>
              <p className="mt-2 text-[15px] leading-7 text-[#4a3d73] sm:text-base">
                Радость, спокойствие, вдохновение, благодарность, принятие себя,
                отдых, гармония – каждая практика помогает слушателю уделить время
                себе.
              </p>
            </div>
          </div>
        </Section>

        <Section id="why" title="Зачем участвовать">
          <ul className="grid gap-3 sm:grid-cols-2">
            {benefits.map((item) => (
              <li key={item} className={`${cardClassName} text-[15px] leading-7 text-[#4a3d73] sm:text-base`}>
                {item}
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
          <div className="mt-5 grid gap-4 sm:grid-cols-2" data-sprint-queries="pending">
            {directions.map((name) => (
              <div
                key={name}
                className="rounded-[24px] border border-[#d7c4f5] bg-[#faf6ff] px-5 py-5 sm:px-6"
              >
                <h3 className="text-lg font-semibold text-[#25135c]">{name}</h3>
                <p className="mt-2 text-[15px] font-medium leading-7 text-[#7042c5] sm:text-base">
                  Список готовится
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="conditions" title="Условия участия">
          <ul className="list-disc space-y-2 pl-5 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            {conditions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            Количество работ не ограничено. Одна работа – один шанс в розыгрыше.
            Пять – предел одновременной брони, а не общего количества работ.
          </p>
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

        <Section id="prizes" title="Призовой фонд – 6 000 ₽">
          <div className="grid gap-3 sm:grid-cols-3">
            {prizes.map(([place, amount]) => (
              <div key={place} className={cardClassName}>
                <p className="text-sm font-semibold text-[#7d70a2]">{place}</p>
                <p className="mt-1 text-2xl font-semibold text-[#25135c]">{amount}</p>
              </div>
            ))}
          </div>
          <div className={`mt-5 ${proseClassName}`}>
            <p>
              Призы разыгрываются открыто. Одна опубликованная работа – один шанс.
              Один автор может получить не более одного денежного приза; при
              повторном выпадении проводится перерозыгрыш.
            </p>
            <p>Дата розыгрыша будет объявлена позже.</p>
          </div>
        </Section>

        <Section id="who" title="Кто может участвовать">
          <div className={proseClassName}>
            <p>
              Действующие авторы АудиоЛада. Участие предполагает создание и
              публикацию авторского аудиопродукта с необходимыми правами на музыку
              и материалы.
            </p>
          </div>
        </Section>

        <Section id="when" title="Когда проходит">
          <div className={proseClassName}>
            <p>14–29 ноября 2026 года. 16 дней для творчества и публикации.</p>
          </div>
        </Section>

        <section
          className="mt-14 rounded-[30px] border border-[#e4d5f6] bg-[#faf7ff] px-5 py-8 sm:px-7 sm:py-9"
          aria-labelledby="final-cta-heading"
        >
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
