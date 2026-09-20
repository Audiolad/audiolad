import type { ArticleCreatorPathsContinuation } from "@/lib/seo/articles";
import { MEDITATION_AUTHORS_LANDING_PATH } from "@/lib/seo/meditation-authors-landing";

const STUDIO_HREF = "https://audiolad.ru/studio/meditation";
const AUTHOR_LANDING_HREF = MEDITATION_AUTHORS_LANDING_PATH;

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

function AuthorLandingVisual() {
  return (
    <div
      className="flex h-14 items-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-3"
      aria-hidden="true"
    >
      <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#eadff8]">
        <span className="absolute inset-[3px] rounded-full bg-[#7042c5]/60" />
        <span className="relative h-2.5 w-2.5 rounded-full bg-white" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="h-1.5 w-10 rounded-full bg-[#c9b6ea]" />
        <span className="flex items-center gap-1.5 rounded-md border border-[#eadff8] bg-white px-1.5 py-1">
          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#7042c5] text-[7px] leading-none text-white">
            ▶
          </span>
          <span className="h-1 w-8 rounded-full bg-[#dfd0f3]" />
        </span>
      </span>
      <span className="h-7 w-px bg-[#dfd0f3]" />
      <span className="h-1.5 w-5 rounded-full bg-[#c9b6ea]" />
    </div>
  );
}

type CreatorPathCardProps = {
  kind: "studio" | "author";
};

function CreatorPathCard({ kind }: CreatorPathCardProps) {
  const isStudio = kind === "studio";
  const title = isStudio
    ? "Уже готовы записать свою медитацию?"
    : "Публикуйте свои медитации и находите новых слушателей";
  const description = isStudio
    ? "Запишите голос, добавьте музыку и соберите готовую медитацию прямо в браузере – без специальных навыков и сложных программ."
    : "Создайте своё авторское пространство, публикуйте бесплатные и платные практики, находите новых слушателей через поиск и зарабатывайте на своём творчестве.";
  const href = isStudio ? STUDIO_HREF : AUTHOR_LANDING_HREF;
  const eyebrow = isStudio ? "СТУДИЯ АУДИОЛАД" : "АВТОРАМ АУДИОЛАДА";
  const cta = isStudio
    ? "Попробуйте бесплатно прямо сейчас"
    : "Стать автором бесплатно";

  return (
    <a
      href={href}
      {...(isStudio
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      className="group flex min-h-[13.5rem] flex-col rounded-[22px] border border-[#dfd0f3] bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#c9b6ea] hover:bg-[#fdfbff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] motion-reduce:transform-none sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold tracking-[0.08em] text-[#7d70a2]">
          {eyebrow}
        </p>
        <div className="w-[7.25rem] shrink-0">
          {isStudio ? <StudioVisual /> : <AuthorLandingVisual />}
        </div>
      </div>
      <h3 className="mt-3 text-[17px] font-semibold leading-snug tracking-tight text-[#25135c] sm:text-lg">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-[#4a3d73]">{description}</p>
      <span className="mt-auto pt-3 text-sm font-semibold text-[#7042c5] group-hover:text-[#6338b0]">
        {cta}
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
          Хотите создать и опубликовать свою медитацию?
        </h2>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4">
        <CreatorPathCard kind="studio" />
        <CreatorPathCard kind="author" />
      </div>
    </section>
  );
}
