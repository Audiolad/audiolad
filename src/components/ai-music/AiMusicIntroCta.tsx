import Link from "next/link";

type AiMusicIntroCtaProps = {
  title?: string;
  paragraphs?: readonly string[];
};

const defaultParagraphs = [
  "Даже если вы пока только учитесь создавать музыку и ещё не планируете её продавать, загляните в АудиоЛад. Послушайте музыку и аудиопрактики, посмотрите, как оформлены продукты и какие возможности есть у авторов.",
  "Можно зарегистрироваться бесплатно, познакомиться с площадкой и вернуться к публикации своей музыки тогда, когда будете готовы.",
] as const;

export default function AiMusicIntroCta({
  title = "Посмотрите, как устроен АудиоЛад",
  paragraphs = defaultParagraphs,
}: AiMusicIntroCtaProps) {
  return (
    <aside
      className="mt-14 max-w-3xl overflow-hidden rounded-[28px] border border-[#d8c8ee] bg-gradient-to-br from-[#fffaff] to-[#efe4fb] px-5 py-7 shadow-[0_12px_30px_rgba(90,60,145,0.08)] sm:mt-20 sm:px-8 sm:py-9"
      aria-labelledby="ai-music-intro-cta-title"
    >
      <div className="flex items-start gap-4">
        <svg
          viewBox="0 0 48 48"
          className="h-10 w-10 shrink-0 text-[#7042c5]"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="2" />
          <path
            d="M15 28c3-7 6-7 9 0s6 7 9 0"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path d="M24 12v9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <div>
          <h2
            id="ai-music-intro-cta-title"
            className="text-2xl font-semibold tracking-tight text-[#25135c] sm:text-3xl"
          >
            {title}
          </h2>
          <div className="mt-4 space-y-4 text-[17px] leading-[1.7] text-[#4a3d73] sm:text-[18px]">
            {paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-[#c9b6ea] bg-white px-5 py-2.5 text-center font-medium text-[#56318f] hover:bg-[#faf7ff]"
            >
              Посмотреть АудиоЛад
            </Link>
            <Link
              href="/become-author"
              className="inline-flex min-h-11 items-center justify-center rounded-[18px] bg-[#7042c5] px-5 py-2.5 text-center font-medium text-white hover:bg-[#6338b0]"
            >
              Стать автором
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
