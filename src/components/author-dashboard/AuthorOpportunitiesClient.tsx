import Link from "next/link";
import type { ReactNode } from "react";

import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import type {
  AuthorOpportunitiesViewModel,
  OpportunitiesCta,
  OpportunitiesProgressState,
} from "@/lib/author-dashboard/opportunities";

type Props = {
  view: AuthorOpportunitiesViewModel;
};

function SectionCard({
  title,
  children,
  tone = "default",
}: {
  title?: string;
  children: ReactNode;
  tone?: "default" | "accent";
}) {
  const toneClass =
    tone === "accent"
      ? "border-[#d7c4f5] bg-[#faf6ff]"
      : "border-[#eadff8] bg-white";

  return (
    <section
      className={`rounded-[24px] border px-5 py-6 shadow-[0_8px_22px_rgba(91,62,145,0.06)] ${toneClass}`}
    >
      {title ? (
        <h2 className="text-[20px] font-semibold text-[#25135c]">{title}</h2>
      ) : null}
      {children}
    </section>
  );
}

function CtaLink({
  cta,
  primary,
  className,
}: {
  cta: OpportunitiesCta;
  primary?: boolean;
  className?: string;
}) {
  const base = primary
    ? "inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-6 text-sm font-semibold text-white"
    : "inline-flex min-h-11 items-center justify-center rounded-full border border-[#bda6e1] px-5 text-sm font-semibold text-[#7042c5]";

  if (!cta.href || cta.disabled) {
    return (
      <button
        type="button"
        disabled
        className={`${base} cursor-not-allowed opacity-40 ${className ?? ""}`}
      >
        {cta.label}
      </button>
    );
  }

  return (
    <Link
      href={cta.href}
      target={cta.external ? "_blank" : undefined}
      rel={cta.external ? "noreferrer" : undefined}
      className={`${base} ${className ?? ""}`}
    >
      {cta.label}
    </Link>
  );
}

function progressTone(state: OpportunitiesProgressState): string {
  if (state === "done") {
    return "border-[#cfe8d8] bg-[#f3faf5] text-[#2f7a4b]";
  }
  if (state === "next") {
    return "border-[#d7c4f5] bg-[#f7f2ff] text-[#7042c5]";
  }
  return "border-[#e4d7f4] bg-[#fcfbfe] text-[#8c7dab]";
}

function progressLabel(state: OpportunitiesProgressState): string {
  if (state === "done") {
    return "Готово";
  }
  if (state === "next") {
    return "Следующий шаг";
  }
  return "Доступно позже";
}

export default function AuthorOpportunitiesClient({ view }: Props) {
  const { primaryCta } = view;

  return (
    <div className="space-y-6">
      <AuthorDashboardNav authorSlug={view.authorSlug} />

      <SectionCard tone="accent">
        <p className="text-sm font-semibold uppercase tracking-[0.04em] text-[#8c7dab]">
          Возможности для авторов
        </p>
        <h2 className="mt-2 text-[26px] font-semibold leading-8 text-[#25135c] sm:text-[30px] sm:leading-9">
          Развивайте аудиторию и зарабатывайте на своих аудиопродуктах
        </h2>
        <p className="mt-4 text-[15px] leading-6 text-[#4c3d78]">
          АудиоЛад помогает создавать бесплатные и платные аудиопродукты,
          знакомить с ними новых слушателей, собирать промостраницы,
          отслеживать результаты продвижения и получать вознаграждение от
          продаж.
        </p>
        <p className="mt-4 text-[15px] leading-6 text-[#5f5484]">
          {primaryCta.summary}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <CtaLink cta={primaryCta} primary />
          {view.showPublicAuthorLink && view.publicAuthorHref ? (
            <CtaLink
              cta={{
                label: "Открыть публичную страницу",
                href: view.publicAuthorHref,
                external: true,
              }}
            />
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Ваш следующий шаг">
        <p className="mt-3 text-[15px] leading-6 text-[#4c3d78]">
          Одно основное действие прямо сейчас — без длинного списка задач.
        </p>
        <div className="mt-4 rounded-[20px] border border-[#e4d7f4] bg-[#fcfbfe] px-4 py-4">
          <p className="text-[17px] font-semibold text-[#25135c]">
            {primaryCta.label}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#5f5484]">
            {primaryCta.summary}
          </p>
          <div className="mt-4">
            <CtaLink cta={primaryCta} primary />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Путь автора">
        <p className="mt-3 text-[15px] leading-6 text-[#4c3d78]">
          Как связать продукты, публичное присутствие, продвижение, статистику
          и вознаграждение в один понятный маршрут.
        </p>
        <ol className="mt-5 grid gap-4 md:grid-cols-2">
          {view.journey.map((step, index) => (
            <li
              key={step.id}
              className="rounded-[20px] border border-[#eadff8] bg-[#fcfbfe] px-4 py-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[#8c7dab]">
                Шаг {index + 1}
              </p>
              <h3 className="mt-2 text-[17px] font-semibold text-[#25135c]">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#5f5484]">
                {step.description}
              </p>
              <div className="mt-4">
                <CtaLink cta={step.cta} />
              </div>
            </li>
          ))}
        </ol>
      </SectionCard>

      <SectionCard title="Готовые сценарии">
        <p className="mt-3 text-[15px] leading-6 text-[#4c3d78]">
          Выберите понятный сценарий и перейдите сразу в нужный раздел кабинета.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {view.scenarios.map((scenario) => (
            <article
              key={scenario.id}
              className="rounded-[20px] border border-[#eadff8] bg-white px-4 py-4"
            >
              <h3 className="text-[17px] font-semibold text-[#25135c]">
                {scenario.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#5f5484]">
                {scenario.description}
              </p>
              <div className="mt-4">
                <CtaLink cta={scenario.cta} />
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Ваш прогресс">
        <p className="mt-3 text-[15px] leading-6 text-[#4c3d78]">
          Компактный обзор состояния — без шкалы готовности и отдельной системы
          достижений.
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {view.progress.map((item) => (
            <li
              key={item.id}
              className={`rounded-[18px] border px-4 py-3 ${progressTone(item.state)}`}
            >
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="mt-1 text-xs font-medium opacity-90">
                {progressLabel(item.state)}
              </p>
            </li>
          ))}
        </ul>
      </SectionCard>

      <p className="text-sm leading-6 text-[#5f5484]">
        Нужна пошаговая инструкция?{" "}
        <Link
          href={`/help/authors?author=${encodeURIComponent(view.authorSlug)}`}
          className="font-semibold text-[#7042c5] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Откройте Справочный центр
        </Link>
        .
      </p>
    </div>
  );
}
