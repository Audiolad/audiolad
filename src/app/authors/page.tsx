import Image from "next/image";
import Link from "next/link";

const authors = [
  {
    name: "Сергей и Зоя",
    role: "Совместные медитации и энергопрактики",
    description:
      "Практики для любви, внутренней опоры, отношений, изобилия и гармонии.",
    practices: "18 практик",
    listeners: "12,4 тыс. слушателей",
    image: "/audiolad-logo.png",
    href: "/authors/sergey-and-zoya",
  },
  {
    name: "Зоя Петрова",
    role: "Женские медитации и программы",
    description:
      "Мягкие практики для женственности, самоценности, принятия и внутреннего спокойствия.",
    practices: "11 практик",
    listeners: "8,1 тыс. слушателей",
    image: "/audiolad-logo.png",
    href: "/authors/zoya-petrova",
  },
  {
    name: "Сергей Петров",
    role: "Энергопрактики и внутреннее развитие",
    description:
      "Практики для силы, ясности, границ, движения к цели и раскрытия потенциала.",
    practices: "9 практик",
    listeners: "7,6 тыс. слушателей",
    image: "/audiolad-logo.png",
    href: "/authors/sergey-petrov",
  },
];

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <path
        d="M15 5 8 12l7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <circle
        cx="11"
        cy="11"
        r="7"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="m16.5 16.5 4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function AuthorsPage() {
  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] pb-28 shadow-sm">
        <div className="px-5 pt-5">
          <header className="flex items-center justify-between">
            <Link
              href="/catalog"
              aria-label="Назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <BackIcon />
            </Link>

            <div className="text-center">
              <h1 className="text-[26px] font-semibold">Авторы</h1>
              <p className="mt-1 text-xs text-[#7d70a2]">
                Практики от проверенных специалистов
              </p>
            </div>

            <button
              type="button"
              aria-label="Поиск"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <SearchIcon />
            </button>
          </header>

          <section className="mt-6 rounded-[26px] bg-gradient-to-br from-[#7042c5] to-[#a27ad9] p-5 text-white shadow-[0_14px_34px_rgba(96,59,168,0.22)]">
            <p className="text-sm text-white/75">Авторы АудиоЛада</p>

            <h2 className="mt-2 text-[24px] font-semibold leading-8">
              Найдите голос, которому хочется доверять
            </h2>

            <p className="mt-3 text-sm leading-6 text-white/75">
              У каждого автора свой подход, тематика и атмосфера практик.
            </p>
          </section>

          <section className="mt-7">
            <div className="flex items-center justify-between">
              <h2 className="text-[21px] font-semibold">Все авторы</h2>

              <button
                type="button"
                className="text-sm font-medium text-[#7042c5]"
              >
                По популярности⌄
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {authors.map((author) => (
                <article
                  key={author.name}
                  className="rounded-[26px] border border-[#eadff8] bg-white p-4 shadow-[0_10px_28px_rgba(91,62,145,0.07)]"
                >
                  <div className="flex gap-4">
                    <div className="flex h-[112px] w-[112px] shrink-0 items-center justify-center overflow-hidden rounded-[24px] bg-[#f5edfc]">
                      <Image
                        src={author.image}
                        alt={author.name}
                        width={112}
                        height={112}
                        className="h-full w-full object-contain p-4"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <Link
                        href={author.href}
                        className="text-[19px] font-semibold"
                      >
                        {author.name}
                      </Link>

                      <p className="mt-1 text-sm font-medium text-[#7042c5]">
                        {author.role}
                      </p>

                      <p className="mt-2 line-clamp-3 text-sm leading-5 text-[#70628e]">
                        {author.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-[#eee6f7] pt-4">
                    <div>
                      <p className="text-sm font-medium">{author.practices}</p>
                      <p className="mt-1 text-xs text-[#8a7ca9]">
                        {author.listeners}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-[#bda6e1] px-4 py-2 text-sm font-medium text-[#7042c5]"
                      >
                        Подписаться
                      </button>

                      <Link
                        href={author.href}
                        className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white"
                      >
                        Открыть
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] p-5">
            <h2 className="text-lg font-semibold text-[#7042c5]">
              Хотите стать автором?
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#70628e]">
              Размещайте медитации, энергопрактики, молитвы, программы и
              аудиокурсы.
            </p>

            <Link
              href="/profile"
              className="mt-4 inline-flex rounded-[16px] bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
            >
              Узнать подробнее
            </Link>
          </section>
        </div>

        <nav className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[430px] -translate-x-1/2 justify-around border-t border-[#eadff8] bg-white/95 px-1 pb-3 pt-3 shadow-[0_-8px_30px_rgba(86,52,141,0.08)] backdrop-blur">
          <Link
            href="/"
            className="flex min-w-[72px] flex-col items-center gap-1 text-[11px] text-[#81759f]"
          >
            <span className="text-[25px] leading-none">⌂</span>
            <span>Главная</span>
          </Link>

          <Link
            href="/catalog"
            className="flex min-w-[72px] flex-col items-center gap-1 text-[11px] text-[#7042c5]"
          >
            <span className="text-[25px] leading-none">▦</span>
            <span>Каталог</span>
          </Link>

          <Link
            href="/my-practices"
            className="flex min-w-[72px] flex-col items-center gap-1 text-[11px] text-[#81759f]"
          >
            <span className="text-[25px] leading-none">▥</span>
            <span>Мои практики</span>
          </Link>

          <Link
            href="/playlists"
            className="flex min-w-[72px] flex-col items-center gap-1 text-[11px] text-[#81759f]"
          >
            <span className="text-[25px] leading-none">♫</span>
            <span>Плейлисты</span>
          </Link>

          <Link
            href="/profile"
            className="flex min-w-[72px] flex-col items-center gap-1 text-[11px] text-[#81759f]"
          >
            <span className="text-[25px] leading-none">◎</span>
            <span>Профиль</span>
          </Link>
        </nav>
      </div>
    </main>
  );
}