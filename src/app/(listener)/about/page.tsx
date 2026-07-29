import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import JsonLd from "@/components/seo/JsonLd";
import { buildAboutPageJsonLd } from "@/lib/seo/json-ld";
import {
  ABOUT_PAGE_H1,
  ABOUT_SEO_DESCRIPTION,
  buildAboutMetadata,
} from "@/lib/seo/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildAboutMetadata();
}

const FIND_ITEMS = [
  {
    title: "Медитации",
    description:
      "Короткие и развёрнутые аудиоматериалы, которые помогают замедлиться, собраться и вернуться к себе.",
  },
  {
    title: "Аудиопрактики",
    description:
      "Авторские практики для работы с вниманием, состоянием и повседневными задачами.",
  },
  {
    title: "Программы",
    description:
      "Серии материалов, выстроенные как последовательный путь, а не случайный набор треков.",
  },
  {
    title: "Плейлисты",
    description:
      "Подборки, которые удобно возвращать в нужный момент – утром, в дороге или вечером.",
  },
  {
    title: "Персональные материалы",
    description:
      "Индивидуальные аудиозаписи от авторов для конкретной ситуации или запроса слушателя.",
  },
  {
    title: "Бесплатные материалы",
    description:
      "Практики и медитации, с которых можно начать знакомство с платформой без оплаты.",
  },
] as const;

const LISTENER_CAPABILITIES = [
  {
    title: "Авторский контент",
    description:
      "Материалы создают авторы со своей позицией, голосом и подходом – не обезличенный поток.",
  },
  {
    title: "Удобное прослушивание",
    description:
      "Слушайте онлайн в удобное время: на телефоне или компьютере, без лишних шагов.",
  },
  {
    title: "Личная аудиотека",
    description:
      "Сохраняйте нужные материалы и возвращайтесь к ним, когда они снова понадобятся.",
  },
  {
    title: "Бесплатный вход",
    description:
      "Часть каталога доступна сразу – можно понять формат платформы до покупки.",
  },
  {
    title: "Страницы авторов",
    description:
      "У каждого автора есть публичная страница с материалами и понятным контекстом работы.",
  },
  {
    title: "Статьи и справка",
    description:
      "Рядом с каталогом есть статьи о темах платформы и справочный центр по работе с сервисом.",
  },
] as const;

const APPROACH_PRINCIPLES = [
  {
    title: "Человек важнее алгоритмов",
    description:
      "Рекомендации и интерфейс должны помогать найти нужное, а не удерживать внимание любой ценой.",
  },
  {
    title: "Польза важнее вовлечённости",
    description:
      "Мы ориентируемся на материалы, к которым хочется возвращаться, а не на бесконечную ленту.",
  },
  {
    title: "Доверие важнее краткосрочной выгоды",
    description:
      "Прозрачные условия, спокойный тон и уважение к времени слушателя важнее агрессивных приёмов роста.",
  },
  {
    title: "Технологии должны помогать человеку",
    description:
      "Плеер, каталог, аудиотека и личные разделы существуют для удобства, а не ради сложности.",
  },
  {
    title: "Автор – партнёр платформы",
    description:
      "Авторы не расходный контент. Мы строим условия, в которых их работа остаётся видимой и осмысленной.",
  },
] as const;

const NEXT_LINKS = [
  {
    href: "/catalog",
    title: "Каталог",
    description: "Открыть опубликованные аудиопрактики, медитации и программы.",
  },
  {
    href: "/authors",
    title: "Авторы",
    description: "Познакомиться с авторами и перейти на их публичные страницы.",
  },
  {
    href: "/articles",
    title: "Статьи",
    description: "Прочитать материалы о темах, с которыми работает платформа.",
  },
  {
    href: "/help",
    title: "Помощь и поддержка",
    description: "Найти инструкции для слушателей и авторов или обратиться в поддержку.",
  },
  {
    href: "/for-authors",
    title: "Авторам",
    description:
      "Познакомиться с возможностями для авторов и перейти к заявке на АудиоЛаде.",
  },
] as const;

const linkFocusClass =
  "focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

const cardClassName =
  "rounded-[20px] border border-[#e8def5] bg-white px-5 py-4";

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
      <h2
        id={id}
        className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl"
      >
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
        {children}
      </div>
    </section>
  );
}

export default function AboutPage() {
  const jsonLd = buildAboutPageJsonLd({
    title: ABOUT_PAGE_H1,
    description: ABOUT_SEO_DESCRIPTION,
    path: "/about",
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
              О платформе
            </li>
          </ol>
        </nav>

        <header className="mt-6 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight text-[#25135c] sm:text-4xl">
            {ABOUT_PAGE_H1}
          </h1>
          <p className="mt-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            АудиоЛад – платформа авторских аудиопрактик, медитаций и программ,
            созданная для людей, которым важно находить качественный
            аудиоконтент и возвращаться к нему в удобное время.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/catalog"
              className={`inline-flex min-h-11 items-center justify-center rounded-[22px] bg-[#7042c5] px-5 py-3 text-[16px] font-medium text-white hover:bg-[#6338b0] ${linkFocusClass}`}
            >
              Перейти в каталог
            </Link>
            <Link
              href="/for-authors"
              className={`inline-flex min-h-11 items-center justify-center rounded-[22px] border border-[#c9b5e8] bg-white px-5 py-3 text-[16px] font-medium text-[#7042c5] hover:bg-[#faf7ff] ${linkFocusClass}`}
            >
              Авторам
            </Link>
          </div>
        </header>

        <Section id="about-why" title="Почему появился АудиоЛад">
          <p>
            Современный мир перегружен информацией. Нового контента становится
            всё больше, а внимания у человека – всё меньше. В этом потоке легко
            потерять то, что действительно полезно и к чему хочется возвращаться.
          </p>
          <p>
            АудиоЛад появился как место, где авторский аудиоконтент собран
            спокойно и понятно: без шума, без гонки за вовлечённостью и без
            ощущения, что сервис важнее человека.
          </p>
        </Section>

        <Section id="about-what" title="Что такое АудиоЛад">
          <p>
            АудиоЛад – платформа авторских аудиопрактик, медитаций и программ.
            Здесь можно найти материалы по темам самочувствия, внимания,
            привычек и внутренней опоры, а также сохранить нужное в личном
            пространстве.
          </p>
          <p>
            Слушатель открывает каталог, выбирает автора или тему, слушает
            онлайн и при необходимости возвращается к материалам позже. Автор
            публикует свои работы, ведёт публичную страницу и может предлагать
            как открытые, так и платные материалы.
          </p>
        </Section>

        <section
          className="mt-12 max-w-3xl"
          aria-labelledby="about-find-heading"
        >
          <h2
            id="about-find-heading"
            className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl"
          >
            Что можно найти на платформе
          </h2>
          <ul className="mt-5 grid list-none gap-3 p-0 sm:grid-cols-2">
            {FIND_ITEMS.map((item) => (
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
        </section>

        <Section id="about-audio" title="Почему именно аудио">
          <p>
            Аудио не требует постоянного взгляда на экран. Его можно слушать в
            дороге, дома, во время короткой паузы или в конце дня – когда
            текстовый формат уже не подходит.
          </p>
          <p>
            Голос автора передаёт не только смысл, но и тон. Для практик и
            медитаций это особенно важно: человек слышит живую интонацию, а не
            только набор формулировок.
          </p>
        </Section>

        <Section id="about-authors" title="Авторы АудиоЛада">
          <p>
            Материалы на платформе создают авторы. У каждого есть собственная
            публичная страница, где собраны его работы и краткое представление.
          </p>
          <p>
            Мы относимся к автору как к партнёру платформы: его голос, подход и
            ответственность за материал остаются на первом плане. Если вы
            создаёте аудиопрактики, медитации или программы и хотите публиковать
            их на АудиоЛаде,{" "}
            <Link
              href="/for-authors"
              className={`font-medium text-[#7042c5] underline-offset-2 hover:underline ${linkFocusClass}`}
            >
              познакомьтесь с возможностями для авторов
            </Link>{" "}
            или сразу{" "}
            <Link
              href="/become-author"
              className={`font-medium text-[#7042c5] underline-offset-2 hover:underline ${linkFocusClass}`}
            >
              подайте заявку
            </Link>
            .
          </p>
        </Section>

        <section
          className="mt-12 max-w-3xl"
          aria-labelledby="about-listeners-heading"
        >
          <h2
            id="about-listeners-heading"
            className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl"
          >
            Возможности для слушателей
          </h2>
          <ul className="mt-5 grid list-none gap-3 p-0 sm:grid-cols-2">
            {LISTENER_CAPABILITIES.map((item) => (
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
        </section>

        <section
          className="mt-12 max-w-3xl"
          aria-labelledby="about-approach-heading"
        >
          <h2
            id="about-approach-heading"
            className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl"
          >
            Наш подход
          </h2>
          <p className="mt-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            Это краткое знакомство с тем, на чём строится платформа.
          </p>
          <ul className="mt-5 space-y-3">
            {APPROACH_PRINCIPLES.map((item) => (
              <li key={item.title} className={`${cardClassName} sm:px-6`}>
                <h3 className="text-base font-semibold text-[#25135c]">
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
          className="mt-12 max-w-3xl"
          aria-labelledby="about-beliefs-heading"
        >
          <h2
            id="about-beliefs-heading"
            className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl"
          >
            Во что мы верим
          </h2>
          <p className="mt-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            АудиоЛад развивается на основе принципов, которые помогают нам
            принимать решения, выстраивать отношения с авторами и создавать
            полезный опыт для слушателей.
          </p>
          <p className="mt-4">
            <Link
              href="/philosophy"
              className={`text-base font-medium text-[#7042c5] underline-offset-2 hover:underline ${linkFocusClass}`}
            >
              Познакомиться с принципами АудиоЛада
            </Link>
          </p>
        </section>

        <section
          className="mt-12 max-w-3xl"
          aria-labelledby="about-next-heading"
        >
          <h2
            id="about-next-heading"
            className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl"
          >
            Куда перейти дальше
          </h2>
          <p className="mt-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            Если вы уже понимаете, зачем вам АудиоЛад, выберите следующий шаг.
          </p>
          <ul className="mt-5 grid list-none gap-3 p-0">
            {NEXT_LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex min-h-11 flex-col justify-center rounded-[20px] border border-[#e8def5] bg-white px-5 py-4 transition hover:border-[#c9b6ea] hover:bg-[#faf7ff] ${linkFocusClass}`}
                >
                  <span className="text-base font-semibold text-[#7042c5]">
                    {item.title}
                  </span>
                  <span className="mt-1 text-sm leading-6 text-[#4a3d73]">
                    {item.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </>
  );
}
