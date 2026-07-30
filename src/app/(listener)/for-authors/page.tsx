import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import JsonLd from "@/components/seo/JsonLd";
import {
  FOR_AUTHORS_AUDIENCE,
  FOR_AUTHORS_CAPABILITIES,
  FOR_AUTHORS_FAQ,
  FOR_AUTHORS_FORMATS,
  FOR_AUTHORS_LEAD,
  FOR_AUTHORS_PAGE_H1,
  FOR_AUTHORS_PARTNERSHIP_PRINCIPLES,
  FOR_AUTHORS_PATH,
  FOR_AUTHORS_PERSONAL_STEPS,
  FOR_AUTHORS_PERSONAL_USE_CASES,
  FOR_AUTHORS_SEO_DESCRIPTION,
  FOR_AUTHORS_START_STEPS,
  FOR_AUTHORS_TRUST_LINE,
} from "@/lib/seo/for-authors";
import { buildForAuthorsPageJsonLd } from "@/lib/seo/json-ld";
import { buildForAuthorsMetadata } from "@/lib/seo/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildForAuthorsMetadata();
}

const linkFocusClass =
  "focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

const proseClassName =
  "mt-4 space-y-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8";

const headingClassName =
  "scroll-mt-24 text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl";

const cardClassName =
  "rounded-[20px] border border-[#e8def5] bg-white px-5 py-4";

const primaryCtaClassName = `inline-flex min-h-11 items-center justify-center rounded-[22px] bg-[#7042c5] px-5 py-3 text-[16px] font-medium text-white hover:bg-[#6338b0] ${linkFocusClass}`;

const secondaryCtaClassName = `inline-flex min-h-11 items-center justify-center rounded-[22px] border border-[#c9b5e8] bg-white px-5 py-3 text-[16px] font-medium text-[#7042c5] hover:bg-[#faf7ff] ${linkFocusClass}`;

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
      <div className={proseClassName}>{children}</div>
    </section>
  );
}

export default function ForAuthorsPage() {
  const jsonLd = buildForAuthorsPageJsonLd({
    title: FOR_AUTHORS_PAGE_H1,
    description: FOR_AUTHORS_SEO_DESCRIPTION,
    path: FOR_AUTHORS_PATH,
    faq: FOR_AUTHORS_FAQ.map((item) => ({
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
              Авторам
            </li>
          </ol>
        </nav>

        <header className="mt-6 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight text-[#25135c] sm:text-4xl">
            {FOR_AUTHORS_PAGE_H1}
          </h1>
          <p className="mt-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            {FOR_AUTHORS_LEAD}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/become-author" className={primaryCtaClassName}>
              Стать автором
            </Link>
            <a
              href="#for-authors-capabilities"
              className={secondaryCtaClassName}
            >
              Посмотреть возможности
            </a>
          </div>
          <p className="mt-4 text-sm leading-6 text-[#7d70a2]">
            {FOR_AUTHORS_TRUST_LINE}
          </p>
        </header>

        <section
          id="for-authors-audience"
          className="mt-12 max-w-3xl scroll-mt-24"
          aria-labelledby="for-authors-audience-heading"
        >
          <h2 id="for-authors-audience-heading" className={headingClassName}>
            Для кого создан АудиоЛад
          </h2>
          <p className={proseClassName}>
            Платформа подходит разным специалистам, но сценарии использования
            могут отличаться. Ниже – типичные ситуации, в которых АудиоЛад
            помогает автору работать спокойнее и понятнее для слушателя.
          </p>
          <ul className="mt-5 flex list-none flex-col gap-3 p-0 sm:flex-row sm:flex-wrap sm:justify-center">
            {FOR_AUTHORS_AUDIENCE.map((item) => (
              <li
                key={item.title}
                className={`${cardClassName} sm:w-[calc(50%-0.375rem)] lg:w-[calc((100%-1.5rem)/3)]`}
              >
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

        <Section id="for-authors-why-audio" title="Почему именно аудио">
          <p>
            Аудио можно слушать без постоянного взгляда на экран — дома, в
            дороге, во время отдыха или самой практики.
          </p>
          <p>
            Голос автора передаёт смысл, интонацию, состояние и энергетику. Для
            медитаций, энергопрактик и духовных материалов это особенно важно:
            живое звучание помогает сохранить присутствие автора и глубже
            погрузиться в практику.
          </p>
        </Section>

        <Section id="for-authors-formats" title="Что можно публиковать">
          <p>
            Основой авторского материала на АудиоЛаде должен быть живой голос
            автора. Через него слушатель воспринимает смысл, интонацию,
            состояние и энергетику. В зависимости от формата можно публиковать:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            {FOR_AUTHORS_FORMATS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            Видеокурсы, вебинары, встроенные чаты и системы записи на
            консультации не являются частью текущей модели платформы.
          </p>
        </Section>

        <Section id="for-authors-page" title="Публичная страница автора">
          <p>
            После одобрения у автора появляется собственная публичная страница.
            На ней собраны опубликованные материалы и представление автора,
            чтобы слушатель мог познакомиться с подходом до прослушивания.
          </p>
          <p>
            Материалы можно открывать и сохранять. Ссылку на страницу или на
            отдельный продукт удобно использовать в своих каналах продвижения –
            Telegram, сайте, рассылке или личных сообщениях.
          </p>
          <p>
            АудиоЛад не обещает автоматический трафик. Страница и ссылки – это
            инструменты публикации, а развитие аудитории остаётся за автором.
          </p>
        </Section>

        <Section
          id="for-authors-free-paid"
          title="Бесплатные и платные материалы"
        >
          <p>
            Можно начинать с бесплатных материалов – так слушатель знакомится с
            вашим голосом и форматом без оплаты. Платные продукты подключаются
            после коммерческого онбординга.
          </p>
          <p>
            Слушатель получает доступ через платформу: открывает материал,
            оплачивает его при необходимости и сохраняет в своей аудиотеке.
            Бесплатный контент может работать как естественное продолжение вашей
            экспертной работы, а не как отдельный «маркетинговый трюк».
          </p>
          <p>
            Подробные условия сотрудничества опубликованы отдельно:{" "}
            <Link
              href="/author-terms"
              className={`font-medium text-[#7042c5] underline-offset-2 hover:underline ${linkFocusClass}`}
            >
              авторские условия сотрудничества
            </Link>
            .
          </p>
        </Section>

        <section
          id="for-authors-personal"
          className="mt-12 max-w-3xl scroll-mt-24"
          aria-labelledby="for-authors-personal-heading"
        >
          <div className="rounded-[28px] border border-[#eadff8] bg-gradient-to-br from-[#fffaff] to-[#f2e6fb] px-5 py-6 sm:px-6 sm:py-7">
            <h2 id="for-authors-personal-heading" className={headingClassName}>
              Персональные материалы для клиентов
            </h2>
            <p className="mt-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
              Если вы работаете с людьми индивидуально, АудиоЛад помогает
              передавать аудио и PDF без пересылки файлов по чатам и без
              превращения платформы в систему учёта клиентов.
            </p>
            <ol className="mt-6 space-y-3">
              {FOR_AUTHORS_PERSONAL_STEPS.map((step, index) => (
                <li key={step.title} className={`${cardClassName} bg-white/90`}>
                  <p className="text-sm font-medium text-[#7042c5]">
                    Шаг {index + 1}. {step.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#4a3d73]">
                    {step.text}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-base font-medium text-[#25135c]">
              Когда это особенно полезно
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
              {FOR_AUTHORS_PERSONAL_USE_CASES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <Section id="for-authors-library" title="Аудиотека слушателя">
          <p>
            Для автора важно не только опубликовать материал, но и сделать так,
            чтобы клиент или слушатель мог к нему вернуться. В АудиоЛаде
            материалы не теряются в переписке: их можно слушать с телефона,
            сохранять в одном месте и открывать снова, когда они нужны.
          </p>
          <p>
            Купленные и сохранённые материалы остаются доступны в кабинете
            слушателя в рамках действующих условий платформы. Это удобнее, чем
            искать файл в мессенджере или облачной папке.
          </p>
        </Section>

        <Section id="for-authors-programs" title="Программы и аудиокурсы">
          <p>
            Один материал – хороший старт. Когда появляется линейка, автор может
            объединять несколько аудио в последовательный опыт: тематическую
            программу, аудиокурс или серию практик.
          </p>
          <p>
            Слушатель проходит материалы в понятном порядке, а не собирает их из
            разных ссылок. Такой формат подходит наставникам, преподавателям и
            авторам, которые ведут человека через несколько шагов.
          </p>
        </Section>

        <section
          id="for-authors-capabilities"
          className="mt-12 max-w-3xl scroll-mt-24"
          aria-labelledby="for-authors-capabilities-heading"
        >
          <h2
            id="for-authors-capabilities-heading"
            className={headingClassName}
          >
            Возможности для автора
          </h2>
          <ul className="mt-5 grid list-none gap-3 p-0 sm:grid-cols-2">
            {FOR_AUTHORS_CAPABILITIES.map((item) => (
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

        <Section id="for-authors-promotion" title="Продвижение и статистика">
          <p>
            АудиоЛад предоставляет инструменты публикации и аналитики, а автор
            сохраняет контроль над своими каналами продвижения.
          </p>
          <p>
            В кабинете доступны промостраницы, кампании, UTM-ссылки и статистика
            по просмотрам, запускам, завершениям, сохранениям и покупкам. Это
            помогает понимать, какие материалы и какие источники работают лучше.
          </p>
          <p>
            Платформа не ведёт рекламу вместо автора и не обещает поток
            клиентов. Инструменты нужны для прозрачной работы с вашими
            собственными запусками и ссылками.
          </p>
        </Section>

        <Section
          id="for-authors-cooperation"
          title="Как устроено сотрудничество"
        >
          <p>
            Автор подаёт заявку и рассказывает о направлении. Команда АудиоЛада
            знакомится с автором и материалами. Одобрение не происходит
            автоматически.
          </p>
          <p>
            После предварительного одобрения открывается авторский кабинет:
            можно готовить профиль и бесплатные материалы. Платные возможности
            подключаются отдельно – после коммерческого онбординга и нужных
            проверок.
          </p>
          <p>
            Дальше автор управляет контентом через кабинет: публикует материалы,
            делится ссылками, смотрит статистику и развивает своё направление.
          </p>
        </Section>

        <section
          id="for-authors-principles"
          className="mt-12 max-w-3xl scroll-mt-24"
          aria-labelledby="for-authors-principles-heading"
        >
          <h2 id="for-authors-principles-heading" className={headingClassName}>
            Принципы партнёрства
          </h2>
          <p className={proseClassName}>
            Мы строим сотрудничество спокойно и без манипулятивного продвижения.
            Для автора важны ясность, уважение к аудитории и качество
            материалов.
          </p>
          <ul className="mt-5 space-y-3">
            {FOR_AUTHORS_PARTNERSHIP_PRINCIPLES.map((item) => (
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
          <p className="mt-5">
            <Link
              href="/philosophy"
              className={`text-base font-medium text-[#7042c5] underline-offset-2 hover:underline ${linkFocusClass}`}
            >
              Подробнее о принципах АудиоЛада
            </Link>
          </p>
        </section>

        <section
          id="for-authors-start"
          className="mt-12 max-w-3xl scroll-mt-24"
          aria-labelledby="for-authors-start-heading"
        >
          <h2 id="for-authors-start-heading" className={headingClassName}>
            Как начать
          </h2>
          <ol className="mt-5 space-y-3">
            {FOR_AUTHORS_START_STEPS.map((step, index) => (
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
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/become-author" className={primaryCtaClassName}>
              Подать заявку
            </Link>
            <Link
              href="/help/authors"
              className={`text-[15px] font-medium text-[#7042c5] underline-offset-2 hover:underline ${linkFocusClass}`}
            >
              Инструкция для авторов
            </Link>
          </div>
        </section>

        <section
          id="for-authors-faq"
          className="mt-12 max-w-3xl scroll-mt-24"
          aria-labelledby="for-authors-faq-heading"
        >
          <h2 id="for-authors-faq-heading" className={headingClassName}>
            Частые вопросы
          </h2>
          <div className="mt-5 space-y-4">
            {FOR_AUTHORS_FAQ.map((item) => (
              <div key={item.question} className={cardClassName}>
                <h3 className="text-base font-semibold text-[#25135c]">
                  {item.question}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#4a3d73] sm:text-[15px] sm:leading-7">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          className="mt-12 max-w-3xl rounded-[28px] border border-[#eadff8] bg-[#faf7ff] px-5 py-6 sm:px-6"
          aria-labelledby="for-authors-final-cta-heading"
        >
          <h2
            id="for-authors-final-cta-heading"
            className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl"
          >
            Готовы подать заявку?
          </h2>
          <p className="mt-3 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            Если формат АудиоЛада вам близок, расскажите о себе и материалах,
            которые хотите публиковать. Мы внимательно изучим заявку и ответим
            по итогам рассмотрения.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/become-author" className={primaryCtaClassName}>
              Стать автором
            </Link>
            <Link href="/authors" className={secondaryCtaClassName}>
              Посмотреть авторов
            </Link>
          </div>
        </section>
      </article>
    </>
  );
}
