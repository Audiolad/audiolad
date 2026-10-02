import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import {
  buildSiteCanonicalUrl,
  SITE_BRAND,
} from "@/lib/seo/public-page-metadata";

const PAGE_PATH = "/osen-zvuchit";
const SPRINT_HREF = "/author-dashboard/audio-sprints/osen-zvuchit-2026";
const PAGE_TITLE = "Осень звучит – АудиоСпринт для авторов АудиоЛада";
const PAGE_DESCRIPTION =
  "«Осень звучит» – авторский спринт АудиоЛада с 3 по 18 октября 2026 года: 100 поисковых запросов Яндекса, музыка, медитации и практики, призовой фонд 6 000 ₽.";

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
  "text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8";

const cardClassName =
  "rounded-[24px] border border-[#e8def5] bg-white px-5 py-5 sm:px-6";

const benefits = [
  "создать новый классный продукт;",
  "попробовать новую тему, до которой раньше не доходили руки;",
  "по-новому упаковать уже созданную музыку;",
  "пополнить свой каталог на АудиоЛаде;",
  "создавать продукты под то, что люди уже ищут в Яндексе;",
  "дать своим аудио дополнительную возможность находить слушателей через поиск;",
  "лучше освоить оформление и поисковое продвижение продуктов;",
  "почувствовать общий ритм и движение вместе с другими авторами;",
  "получить шанс выиграть денежный приз.",
];

const packagingItems = [
  "подназвание;",
  "описание;",
  "SEO-заголовок;",
  "SEO-описание;",
  "3 пункта «Как слушать» или «Как проходить»;",
  "3 вопроса и ответа;",
  "обложку;",
  "аудио.",
];

const conditions = [
  "поисковый запрос выбран и забронирован в разделе «Осень звучит»;",
  "название продукта точно совпадает с выбранным поисковым запросом;",
  "продукт бесплатный;",
  "продукт опубликован в общем каталоге АудиоЛада;",
  "оформление продукта полностью заполнено;",
  "продукт прошёл модерацию и опубликован не позднее 18 октября 2026 года включительно.",
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
      <h2 id={`${id}-heading`} className={headingClassName}>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className={cardClassName}>
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f1e9fb] text-sm font-bold text-[#7042c5]">
          {number}
        </span>
        <div>
          <h3 className="text-lg font-semibold text-[#25135c]">{title}</h3>
          <div className="mt-2 space-y-3 text-[15px] leading-7 text-[#4a3d73] sm:text-base">
            {children}
          </div>
        </div>
      </div>
    </li>
  );
}

export default function OsenZvuchitPage() {
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
            Осень звучит
          </li>
        </ol>
      </nav>

      <header className="mt-6 overflow-hidden rounded-[32px] border border-[#eadff8] bg-gradient-to-br from-[#fff8eb] via-[#fffaff] to-[#f2e8ff] px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
        <div className="max-w-4xl">
          <p className="inline-flex rounded-full border border-[#e2c8ff] bg-white/80 px-3 py-1.5 text-sm font-semibold text-[#7042c5]">
            3–18 октября 2026 года
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-[#25135c] sm:text-5xl">
            Осень звучит
          </h1>
          <p className="mt-3 text-xl font-medium text-[#4a3d73] sm:text-2xl">
            АудиоСпринт для авторов АудиоЛада
          </p>
          <p className="mt-5 max-w-3xl text-base leading-7 text-[#4a3d73] sm:text-lg sm:leading-8">
            Выберите готовый <strong className="text-[#25135c]">поисковый запрос Яндекса</strong>,
            создайте по нему бесплатный аудиопродукт и опубликуйте его в каталоге
            АудиоЛада.
          </p>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[#4a3d73] sm:text-lg sm:leading-8">
            Мы подготовили <strong className="text-[#25135c]">100 поисковых запросов</strong> для
            музыки, медитаций, аффирмаций и аудиопрактик. Среди участников
            разыграем <strong className="text-[#25135c]">3 денежных приза – 3 000 ₽, 2 000 ₽ и 1 000 ₽.</strong>
          </p>

          <div className="mt-7 grid max-w-3xl gap-3 sm:grid-cols-3">
            {[
              ["16 дней", "на создание и публикацию"],
              ["100 запросов", "на старте спринта"],
              ["6 000 ₽", "призовой фонд"],
            ].map(([value, label]) => (
              <div
                key={value}
                className="rounded-[20px] border border-white/80 bg-white/80 px-4 py-4 shadow-sm"
              >
                <p className="text-xl font-semibold text-[#25135c]">{value}</p>
                <p className="mt-1 text-sm leading-5 text-[#7d70a2]">{label}</p>
              </div>
            ))}
          </div>

          <div className="mt-7">
            <Link href={SPRINT_HREF} className={primaryCtaClassName}>
              Выбрать поисковый запрос
            </Link>
          </div>
        </div>
      </header>

      <section
        className="mt-6 max-w-4xl rounded-[28px] border border-[#ead7bc] bg-[#fff9ef] px-5 py-6 sm:px-7"
        aria-labelledby="three-months-heading"
      >
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#9a6b2f]">
          3 октября – ровно 3 месяца АудиоЛаду
        </p>
        <h2
          id="three-months-heading"
          className="mt-2 text-2xl font-semibold tracking-tight text-[#25135c] sm:text-3xl"
        >
          Этот старт для нас особенный
        </h2>
        <div className="mt-4 space-y-3 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
          <p>
            3 июля 2026 года родилась идея АудиоЛада и был куплен домен. За эти
            три месяца АудиоЛад прошёл путь от задумки до работающей платформы с
            авторами, каталогом и собственными инструментами продвижения.
          </p>
          <p>
            И символично, что именно 3 октября, ровно через три месяца, мы
            начинаем <strong className="text-[#25135c]">«Осень звучит»</strong> –
            первый общий авторский спринт АудиоЛада.
          </p>
        </div>
      </section>

      <div className="max-w-4xl">
        <Section id="what-is-it" title="Что такое «Осень звучит»">
          <div className={`space-y-4 ${proseClassName}`}>
            <p>
              «Осень звучит» – авторский спринт АудиоЛада.
            </p>
            <p>
              Мы заранее подобрали реальные поисковые фразы, которые люди вводят
              в Яндексе, когда ищут музыку, медитации, аффирмации и другие
              аудиопрактики.
            </p>
            <p>
              Такие фразы называются <strong className="text-[#25135c]">поисковыми запросами</strong>.
              Иногда их также называют SEO-запросами.
            </p>
            <p>
              Вам не нужно самостоятельно искать тему или разбираться в SEO.
              Выберите интересный запрос, забронируйте его за собой и создайте
              аудио на эту тему.
            </p>
          </div>

          <div className="mt-6 rounded-[26px] border border-[#ead7bc] bg-[#fff9ef] px-5 py-5 sm:px-6">
            <p className="text-base font-semibold text-[#25135c]">
              Если вы нейромузыкант
            </p>
            <div className="mt-3 space-y-3 text-[15px] leading-7 text-[#4a3d73] sm:text-base">
              <p>
                Если у вас уже есть готовый альбом или отдельная композиция,
                которая подходит под выбранный запрос по настроению и характеру,
                не обязательно создавать музыку с нуля.
              </p>
              <p>
                Можно по-новому оформить уже готовый материал под эту тему –
                подобрать соответствующее название, описание и обложку и
                опубликовать его как новый продукт в каталоге.
              </p>
              <p className="font-medium text-[#7042c5]">
                Иногда подходящая музыка у вас уже есть – просто раньше она была
                упакована иначе.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className={cardClassName}>
              <p className="text-3xl font-semibold text-[#7042c5]">56</p>
              <p className="mt-2 text-base font-medium text-[#25135c]">
                запросов для музыки
              </p>
            </div>
            <div className={cardClassName}>
              <p className="text-3xl font-semibold text-[#7042c5]">44</p>
              <p className="mt-2 text-base font-medium text-[#25135c]">
                запроса для медитаций и практик
              </p>
            </div>
          </div>
        </Section>

        <Section id="why" title="Зачем участвовать">
          <p className={proseClassName}>
            Иногда самое сложное – решить, <strong className="text-[#25135c]">что создать следующим</strong>.
            В «Осень звучит» тема уже есть. Вы видите конкретные фразы, которые
            люди действительно ищут в Яндексе, и выбираете ту, которая подходит
            именно вам.
          </p>
          <ul className="mt-5 grid list-none gap-3 p-0 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <li
                key={benefit}
                className="rounded-[20px] border border-[#e8def5] bg-white px-4 py-4 text-[15px] leading-6 text-[#4a3d73]"
              >
                <span className="mr-2 font-bold text-[#7042c5]">✓</span>
                {benefit}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="how" title="Как участвовать">
          <ol className="space-y-4">
            <Step number={1} title="Выберите поисковый запрос">
              <p>
                Откройте раздел <strong className="text-[#25135c]">«Осень звучит»</strong> в своём
                кабинете автора.
              </p>
              <p>
                Все запросы разделены на две категории: <strong className="text-[#25135c]">Музыка</strong> и{" "}
                <strong className="text-[#25135c]">Медитации и практики</strong>. Посмотрите доступные
                варианты и выберите тему, которая подходит вашему творчеству.
              </p>
            </Step>

            <Step number={2} title="Забронируйте запрос">
              <p>
                Нажмите кнопку <strong className="text-[#25135c]">«Забронировать»</strong>. После
                этого запрос закрепляется за вами и становится недоступен другим
                авторам.
              </p>
              <p>
                Одновременно можно держать в брони до <strong className="text-[#25135c]">5 активных
                поисковых запросов</strong>. Бронь действует 7 дней. Если за это
                время продукт по запросу не создан, запрос снова становится
                доступен другим авторам.
              </p>
              <p>
                При этом общее количество продуктов, с которыми вы можете
                участвовать в спринте, <strong className="text-[#25135c]">не ограничено</strong>.
              </p>
            </Step>

            <Step number={3} title="Создайте аудиопродукт">
              <p>
                Если вы выбрали музыкальный запрос – при создании выберите{" "}
                <strong className="text-[#25135c]">«Музыка»</strong>.
              </p>
              <p>
                Если вы создаёте медитацию, аффирмацию или другую голосовую
                практику – выберите <strong className="text-[#25135c]">«Продукт»</strong>, а затем{" "}
                <strong className="text-[#25135c]">«Аудиопрактика»</strong>.
              </p>
              <p>
                Дальше кабинет проведёт вас по этапам создания и оформления
                продукта.
              </p>
            </Step>

            <Step number={4} title="Оформите продукт">
              <p>
                Название продукта должно <strong className="text-[#25135c]">точно совпадать с выбранным
                поисковым запросом</strong>.
              </p>
              <p>Для участия в спринте заполните основные элементы оформления:</p>
              <ul className="list-disc space-y-1 pl-5">
                {packagingItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p>
                В кабинете автора есть готовый промпт, который поможет
                подготовить оформление продукта с помощью ИИ.
              </p>
            </Step>

            <Step number={5} title="Отправьте продукт на модерацию">
              <p>
                Когда всё готово, отправьте продукт на модерацию АудиоЛада.
              </p>
              <p>
                Чтобы работа участвовала в розыгрыше, продукт должен пройти
                модерацию и быть опубликован в каталоге{" "}
                <strong className="text-[#25135c]">не позднее 18 октября 2026 года включительно</strong>.
              </p>
              <p>Поэтому лучше не откладывать отправку на последние часы.</p>
            </Step>
          </ol>
        </Section>

        <Section id="screen" title="Как выглядит выбор запросов">
          <p className={proseClassName}>
            На странице «Осень звучит» можно переключаться между Музыкой и
            Медитациями и практиками, пользоваться поиском и сразу бронировать
            понравившийся запрос.
          </p>

          <figure className="mt-6 overflow-hidden rounded-[26px] border border-[#e8def5] bg-white p-2 shadow-sm">
            <Image
              src="/images/osen-zvuchit/queries.webp"
              alt="Раздел «Осень звучит» в кабинете автора: категории поисковых запросов, поиск и кнопка «Забронировать»"
              width={1100}
              height={632}
              className="h-auto w-full rounded-[20px]"
              sizes="(max-width: 1024px) 100vw, 896px"
              priority={false}
            />
            <figcaption className="px-3 pb-2 pt-3 text-sm leading-6 text-[#7d70a2]">
              Если около запроса стоит статус «Свободен», нажмите
              «Забронировать» – и тема закрепится за вами.
            </figcaption>
          </figure>

          <div className="mt-6">
            <Link href={SPRINT_HREF} className={primaryCtaClassName}>
              Перейти к запросам
            </Link>
          </div>
        </Section>

        <Section id="rules" title="Условия участия">
          <div className="rounded-[28px] border border-[#e8def5] bg-[#faf7ff] px-5 py-6 sm:px-6">
            <p className={proseClassName}>Чтобы продукт вошёл в розыгрыш:</p>
            <ul className="mt-4 space-y-3 text-[15px] leading-7 text-[#4a3d73] sm:text-base">
              {conditions.map((condition) => (
                <li key={condition} className="flex gap-3">
                  <span className="mt-0.5 font-bold text-[#7042c5]">✓</span>
                  <span>{condition}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-7">
            <h3 className="text-xl font-semibold text-[#25135c]">
              Каждый продукт – отдельный шанс
            </h3>
            <p className={`mt-3 ${proseClassName}`}>
              Количество продуктов от одного автора не ограничено. Каждый
              опубликованный по правилам спринта продукт даёт один отдельный шанс
              в розыгрыше.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                ["1 продукт", "1 шанс"],
                ["3 продукта", "3 шанса"],
                ["10 продуктов", "10 шансов"],
              ].map(([products, chances]) => (
                <div key={products} className={cardClassName}>
                  <p className="text-base font-medium text-[#7d70a2]">{products}</p>
                  <p className="mt-1 text-2xl font-semibold text-[#25135c]">{chances}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm leading-6 text-[#7d70a2]">
              Ограничение «до 5» относится только к количеству поисковых
              запросов, которые можно одновременно держать в брони.
            </p>
          </div>
        </Section>

        <section
          id="prizes"
          className="mt-14 scroll-mt-24 rounded-[30px] border border-[#eadff8] bg-gradient-to-br from-[#f8f2ff] to-[#fff8eb] px-5 py-7 sm:px-7 sm:py-8"
          aria-labelledby="prizes-heading"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8b65c7]">
            Призовой фонд – 6 000 ₽
          </p>
          <h2 id="prizes-heading" className="mt-2 text-2xl font-semibold tracking-tight text-[#25135c] sm:text-3xl">
            Три денежных приза
          </h2>
          <p className={`mt-4 ${proseClassName}`}>
            После завершения «Осень звучит» мы проведём розыгрыш среди всех
            продуктов, которые выполнили условия участия.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["3 000 ₽", "2 000 ₽", "1 000 ₽"].map((prize) => (
              <div
                key={prize}
                className="rounded-[22px] border border-white bg-white/85 px-5 py-6 text-center shadow-sm"
              >
                <p className="text-3xl font-semibold text-[#7042c5]">{prize}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-3 text-[15px] leading-7 text-[#4a3d73] sm:text-base">
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

          <div className="mt-6 rounded-[20px] bg-[#25135c] px-5 py-4 text-white">
            <p className="text-sm text-white/75">Розыгрыш состоится</p>
            <p className="mt-1 text-xl font-semibold">19 октября 2026 года</p>
          </div>
        </section>

        <Section id="size" title="Не обязательно создавать что-то большое">
          <div className={`space-y-4 ${proseClassName}`}>
            <p>Для участия не нужен огромный альбом или часовая программа.</p>
            <p>
              Музыкальный продукт может состоять из одной самостоятельной
              композиции. А если вы нейромузыкант и у вас уже есть подходящий
              готовый альбом или трек, возможно, нужный материал вообще не
              придётся создавать заново. Можно подобрать подходящий поисковый
              запрос и по-новому оформить музыку под эту тему.
            </p>
            <p>
              Медитация, аффирмация или аудиопрактика тоже может быть небольшой
              по продолжительности. Главное, чтобы она раскрывала выбранную тему
              и представляла собой законченное аудио.
            </p>
            <p>Смысл спринта не в том, чтобы сделать что-то огромное.</p>
            <p className="text-lg font-semibold text-[#7042c5]">
              Смысл – вдохновиться новой темой, создать хороший продукт и
              выпустить его в мир.
            </p>
          </div>
        </Section>

        <section
          className="mt-14 rounded-[30px] border border-[#e4d5f6] bg-[#faf7ff] px-5 py-8 sm:px-7 sm:py-9"
          aria-labelledby="final-cta-heading"
        >
          <p className="text-sm font-semibold text-[#7042c5]">3–18 октября 2026 года</p>
          <h2
            id="final-cta-heading"
            className="mt-2 text-3xl font-semibold tracking-tight text-[#25135c]"
          >
            Осень звучит
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            100 поисковых запросов уже ждут своих авторов. Выберите тему, которая
            откликается именно вам, создайте новое аудио или по-новому откройте
            уже созданную музыку.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-[#4a3d73]">
            <span>Призовой фонд – 6 000 ₽</span>
            <span>Розыгрыш – 19 октября 2026 года</span>
          </div>
          <div className="mt-7">
            <Link href={SPRINT_HREF} className={primaryCtaClassName}>
              Выбрать поисковый запрос
            </Link>
          </div>
        </section>
      </div>
    </article>
  );
}
