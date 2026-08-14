import { SCHOOL_ORIGIN } from "@/lib/school/host";
import type { ArticleCreatorPathsContinuation } from "@/lib/seo/articles";

const STUDIO_HREF = "https://audiolad.ru/studio/meditation";

type CreatorPathsCtaProps = {
  emphasis: ArticleCreatorPathsContinuation["emphasis"];
  placement: "top" | "bottom";
};

function StudioVisual() {
  return (
    <div
      className="flex h-14 items-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-3"
      aria-hidden="true"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#7042c5] text-xs text-white">
        ●
      </span>
      <span className="flex h-7 items-end gap-0.5">
        {[8, 15, 23, 12, 27, 18, 10, 22, 14].map((height, index) => (
          <span
            key={index}
            className={[
              "block w-1 rounded-full",
              index === 2 || index === 4 || index === 7
                ? "bg-[#7042c5]"
                : "bg-[#c9b6ea]",
            ].join(" ")}
            style={{ height }}
          />
        ))}
      </span>
      <span className="h-7 w-px bg-[#dfd0f3]" />
      <span className="h-1.5 w-5 rounded-full bg-[#c9b6ea]" />
    </div>
  );
}

function SchoolVisual() {
  return (
    <div
      className="grid h-14 grid-cols-[1.25rem_1fr] items-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-3"
      aria-hidden="true"
    >
      <span className="flex flex-col items-center gap-0.5">
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={[
              "grid h-4 w-4 place-items-center rounded-full text-[9px] font-semibold",
              step === 2
                ? "bg-[#7042c5] text-white"
                : "bg-[#eadff8] text-[#7d70a2]",
            ].join(" ")}
          >
            {step}
          </span>
        ))}
      </span>
      <span className="flex flex-col gap-1.5">
        <span className="h-1 w-[88%] rounded-full bg-[#c9b6ea]" />
        <span className="h-1 w-[72%] rounded-full bg-[#c9b6ea]" />
        <span className="h-1 w-[80%] rounded-full bg-[#c9b6ea]" />
      </span>
    </div>
  );
}

type CreatorPathCardProps = {
  kind: "studio" | "school";
};

function CreatorPathCard({ kind }: CreatorPathCardProps) {
  const isStudio = kind === "studio";
  const title = isStudio
    ? "Уже готовы записать свою медитацию?"
    : "Хотите научиться создавать медитации?";
  const description = isStudio
    ? "Запишите голос, добавьте музыку и соберите готовую медитацию прямо в браузере — без сложных программ."
    : "Научитесь выбирать тему, писать сценарий, работать с голосом и создавать собственные аудиопрактики.";
  const href = isStudio ? STUDIO_HREF : SCHOOL_ORIGIN;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-h-[13.5rem] flex-col rounded-[22px] border border-[#dfd0f3] bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#c9b6ea] hover:bg-[#fdfbff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] motion-reduce:transform-none sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold tracking-[0.08em] text-[#7d70a2]">
          {isStudio ? (
            "СТУДИЯ АУДИОЛАД"
          ) : (
            <>
              <span className="block">ШКОЛА</span>
              <span className="block">АУДИОПРАКТИК</span>
            </>
          )}
        </p>
        <div className="w-[7.25rem] shrink-0">
          {isStudio ? <StudioVisual /> : <SchoolVisual />}
        </div>
      </div>
      <h3 className="mt-3 text-[17px] font-semibold leading-snug tracking-tight text-[#25135c] sm:text-lg">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-[#4a3d73]">{description}</p>
      <span className="mt-auto pt-3 text-sm font-semibold text-[#7042c5] group-hover:text-[#6338b0]">
        {isStudio ? (
          "Попробовать бесплатно"
        ) : (
          <>
            <span className="sm:hidden">Посмотреть Школу</span>
            <span className="hidden sm:inline">
              Посмотреть Школу Аудиопрактик
            </span>
          </>
        )}
        <span className="ml-1.5" aria-hidden="true">
          →
        </span>
      </span>
    </a>
  );
}

export default function CreatorPathsCta({
  emphasis,
  placement,
}: CreatorPathsCtaProps) {
  return (
    <section
      aria-labelledby={`creator-paths-cta-${placement}`}
      data-emphasis={emphasis}
      className="rounded-[28px] border border-[#dfd0f3] bg-[#f7f1fc] p-4 sm:p-5"
    >
      <div className="max-w-[36rem]">
        <p className="text-[10px] font-semibold tracking-[0.08em] text-[#7d70a2]">
          СОЗДАНИЕ АУДИОПРАКТИК
        </p>
        <h2
          id={`creator-paths-cta-${placement}`}
          className="mt-1.5 text-[1.1rem] font-semibold leading-snug tracking-tight text-[#25135c] sm:text-xl"
        >
          Хотите создать свою медитацию? Выберите, с чего начать.
        </h2>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4">
        <CreatorPathCard kind="studio" />
        <CreatorPathCard kind="school" />
      </div>
    </section>
  );
}
