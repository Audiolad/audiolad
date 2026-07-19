import Link from "next/link";

import AudioladHorizontalLogo from "@/components/brand/AudioladHorizontalLogo";
import { becomeAuthorBodyClass } from "@/components/become-author/typography";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import type { BecomeAuthorAudience } from "@/lib/author-applications/types";

const becomeAuthorDesktopLogoImageClassName =
  "h-auto w-[clamp(190px,18vw,220px)] max-w-full object-contain object-left";

const becomeAuthorDesktopLogoLinkClassName =
  "inline-flex shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

const becomeAuthorBackButtonClassName =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

function BecomeAuthorBackButton({
  backHref,
  backLabel,
}: {
  backHref: string;
  backLabel: string;
}) {
  return (
    <Link href={backHref} aria-label={backLabel} className={becomeAuthorBackButtonClassName}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <path
          d="M15 5 8 12l7 7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

function BecomeAuthorHeaderActions({ audience }: { audience: BecomeAuthorAudience }) {
  if (audience === "guest") {
    return (
      <Link
        href={buildAuthRouteHref("/auth/sign-in", "/become-author")}
        className="rounded-full border border-[#bda6e1] px-3 py-2 text-xs font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        Войти
      </Link>
    );
  }

  return <span className="h-11 w-11 shrink-0" aria-hidden="true" />;
}

type BecomeAuthorHeaderProps = {
  audience: BecomeAuthorAudience;
};

export default function BecomeAuthorHeader({ audience }: BecomeAuthorHeaderProps) {
  const backHref = audience === "guest" ? "/catalog" : "/profile";
  const backLabel = audience === "guest" ? "Назад в каталог" : "Назад в профиль";

  return (
    <header>
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <BecomeAuthorBackButton backHref={backHref} backLabel={backLabel} />

        <div className="min-w-0 flex-1 text-center">
          <p className="text-xs text-[#7d70a2]">АудиоЛад</p>
          <h1 className="truncate text-[24px] font-semibold">Стать автором</h1>
        </div>

        <div className="flex h-11 w-11 shrink-0 items-center justify-center">
          <BecomeAuthorHeaderActions audience={audience} />
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <BecomeAuthorBackButton backHref={backHref} backLabel={backLabel} />
            <AudioladHorizontalLogo
              className={becomeAuthorDesktopLogoImageClassName}
              linkClassName={becomeAuthorDesktopLogoLinkClassName}
            />
          </div>

          <div className="flex shrink-0 items-center justify-center">
            <BecomeAuthorHeaderActions audience={audience} />
          </div>
        </div>

        <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.01em]">
          Стать автором
        </h1>
      </div>
    </header>
  );
}

export function BecomeAuthorHero() {
  return (
    <section className="mt-6 rounded-[28px] border border-[#eadff8] bg-gradient-to-br from-[#fffaff] to-[#f2e6fb] p-5 shadow-[0_12px_30px_rgba(90,60,145,0.08)] lg:p-6">
      <h2 className="text-[22px] font-semibold leading-tight lg:text-[26px]">
        Стать автором АудиоЛада
      </h2>

      <p className={`mt-3 ${becomeAuthorBodyClass}`}>
        Создавайте аудиопрактики и программы, находите слушателей и развивайте
        своё авторское направление.
      </p>

      <p className={`mt-3 ${becomeAuthorBodyClass}`}>
        АудиоЛад помогает авторам публиковать материалы живым голосом,
        оформлять продукты, собирать аудиторию и подключать продажи.
      </p>
    </section>
  );
}

export function BecomeAuthorInfoSections() {
  return (
    <div className="mt-8 space-y-8">
      <section aria-labelledby="become-author-fit-heading">
        <h2 id="become-author-fit-heading" className="text-[21px] font-semibold">
          Кому подходит
        </h2>

        <div className={`mt-4 rounded-[22px] border border-[#eadff8] bg-white p-5 ${becomeAuthorBodyClass}`}>
          <p>Авторство подойдёт вам, если вы:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>создаёте медитации и аудиопрактики;</li>
            <li>
              работаете как психолог, наставник или специалист помогающей
              профессии;
            </li>
            <li>
              проводите занятия, практики, молитвы, настрои или аудиоуроки;
            </li>
            <li>хотите делиться знаниями и опытом через живой голос;</li>
            <li>
              готовы самостоятельно отвечать за качество и содержание
              материалов.
            </li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="become-author-formats-heading">
        <h2 id="become-author-formats-heading" className="text-[21px] font-semibold">
          Что можно размещать
        </h2>

        <div className={`mt-4 rounded-[22px] border border-[#eadff8] bg-white p-5 ${becomeAuthorBodyClass}`}>
          <ul className="list-disc space-y-2 pl-5">
            <li>одиночные аудиопрактики;</li>
            <li>программы из нескольких аудио;</li>
            <li>медитации, молитвы, настрои, аудиоуроки;</li>
            <li>авторские курсы и восстановительные программы;</li>
            <li>
              другие содержательные голосовые форматы после согласования.
            </li>
          </ul>

          <p className="mt-4 font-medium text-[#7042c5]">
            Основой авторского материала должен быть живой голос автора.
          </p>
        </div>
      </section>

      <section aria-labelledby="become-author-benefits-heading">
        <h2 id="become-author-benefits-heading" className="text-[21px] font-semibold">
          Что получает автор
        </h2>

        <div className={`mt-4 rounded-[22px] border border-[#eadff8] bg-white p-5 ${becomeAuthorBodyClass}`}>
          <ul className="list-disc space-y-2 pl-5">
            <li>страницу автора и авторский кабинет;</li>
            <li>публикацию подарочных и платных продуктов;</li>
            <li>размещение в каталоге и ссылки для продвижения;</li>
            <li>доступ к аудитории платформы;</li>
            <li>
              возможность получать доход после подключения коммерческого
              размещения.
            </li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="become-author-path-heading">
        <h2 id="become-author-path-heading" className="text-[21px] font-semibold">
          Путь автора
        </h2>

        <ol className="mt-4 space-y-4">
          {[
            {
              title: "Зарегистрироваться и познакомиться с платформой",
              text: "Создайте обычный аккаунт слушателя, изучите каталог и посмотрите, насколько вам близок формат АудиоЛада.",
            },
            {
              title: "Подать заявку",
              text: "Расскажите о себе, своём опыте и направлении — это займёт несколько минут.",
            },
            {
              title: "Подготовить профиль и материалы в подарок",
              text: "После предварительного одобрения вы сможете оформить авторский профиль и подготовить минимум одну аудиопрактику в подарок.",
            },
            {
              title: "Пройти проверку материалов",
              text: "Перед публикацией мы знакомимся с материалами, проверяем оформление, качество записи и соответствие правилам платформы.",
            },
            {
              title: "Подключить коммерческое размещение",
              text: "Для продажи продуктов потребуется отдельная проверка, предоставление необходимых реквизитов и оформление договорных отношений.",
            },
            {
              title: "Публиковать и развивать аудиторию",
              text: "После подключения автор может размещать продукты, делиться ссылками и развивать собственное направление.",
            },
          ].map((step, index) => (
            <li
              key={step.title}
              className="rounded-[22px] border border-[#eadff8] bg-white p-5"
            >
              <p className="text-sm font-medium text-[#7042c5]">
                Шаг {index + 1}. {step.title}
              </p>
              <p className={`mt-2 ${becomeAuthorBodyClass}`}>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="become-author-levels-heading">
        <h2 id="become-author-levels-heading" className="text-[21px] font-semibold">
          Два уровня авторства
        </h2>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <article className="rounded-[22px] border border-[#eadff8] bg-white p-5">
            <h3 className="text-[17px] font-semibold">Публикации в подарок</h3>
            <ul className={`mt-3 list-disc space-y-2 pl-5 ${becomeAuthorBodyClass}`}>
              <li>оформить авторский профиль;</li>
              <li>размещать согласованные материалы в подарок;</li>
              <li>знакомить слушателей со своим подходом;</li>
              <li>готовить продукты к коммерческому размещению.</li>
            </ul>
          </article>

          <article className="rounded-[22px] border border-[#eadff8] bg-white p-5">
            <h3 className="text-[17px] font-semibold">Коммерческий автор</h3>
            <ul className={`mt-3 list-disc space-y-2 pl-5 ${becomeAuthorBodyClass}`}>
              <li>размещать платные продукты;</li>
              <li>получать выплаты;</li>
              <li>видеть коммерческую статистику;</li>
              <li>участвовать в развитии каталога.</li>
            </ul>
          </article>
        </div>
      </section>

      <section
        aria-labelledby="become-author-training-heading"
        className="rounded-[22px] border border-[#eadff8] bg-[#faf6ff] p-5"
      >
        <h2 id="become-author-training-heading" className="text-[17px] font-semibold">
          Нужна помощь с созданием аудиопрактик?
        </h2>
        <p className={`mt-3 ${becomeAuthorBodyClass}`}>
          Мы развиваем отдельное обучение для авторов: от выбора темы и
          подготовки сценария до записи, оформления и монетизации
          аудиопродуктов.
        </p>
        <p className="mt-3 text-[15px] leading-snug text-[#9485b4]">
          Информация о первых программах появится позже.
        </p>
      </section>
    </div>
  );
}
