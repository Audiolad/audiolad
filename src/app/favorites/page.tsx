import BottomNav from "@/components/BottomNav";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";
import Link from "next/link";

const favoritePractices = [
  {
    title: "Мои личные границы",
    author: "Сергей и Зоя",
    type: "Энергопрактика",
    duration: "17 мин",
    symbol: "◯",
    gradient: "from-[#7652bc] via-[#bd8fd7] to-[#f1c5d3]",
    href: "/practice/personal-boundaries",
  },
  {
    title: "Сила женственности",
    author: "Зоя Петрова",
    type: "Медитация",
    duration: "16 мин",
    symbol: "♡",
    gradient: "from-[#f9d6e9] via-[#e7b9ec] to-[#9d78df]",
    href: "/authors/zoya-petrova",
  },
  {
    title: "Внутренняя опора",
    author: "Сергей Петров",
    type: "Энергопрактика",
    duration: "15 мин",
    symbol: "✦",
    gradient: "from-[#5f62a9] via-[#8877c8] to-[#c4b2e5]",
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

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

export default function FavoritesPage() {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}>
        <div className="px-5 pt-5">
          <header className="flex items-center justify-between">
            <Link
              href="/profile"
              aria-label="Назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <BackIcon />
            </Link>

            <div className="text-center">
              <h1 className="text-[26px] font-semibold">Избранное</h1>
              <p className="mt-1 text-xs text-[#7d70a2]">
                Сохранённые практики и авторы
              </p>
            </div>

            <div className="h-11 w-11" />
          </header>

          <section className="mt-7">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {["Все", "Практики", "Программы", "Авторы"].map(
                (item, index) => (
                  <button
                    key={item}
                    type="button"
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm ${
                      index === 0
                        ? "border-[#7042c5] bg-[#7042c5] text-white"
                        : "border-[#ddcfef] bg-white text-[#7042c5]"
                    }`}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
          </section>

          <section className="mt-7">
            <div className="flex items-center justify-between">
              <h2 className="text-[21px] font-semibold">
                Любимые практики
              </h2>

              <p className="text-sm text-[#7d70a2]">
                {favoritePractices.length}
              </p>
            </div>

            <div className="mt-5 space-y-4">
              {favoritePractices.map((practice) => (
                <article
                  key={practice.title}
                  className="flex gap-4 rounded-[24px] border border-[#eadff8] bg-white p-3 shadow-[0_8px_22px_rgba(91,62,145,0.06)]"
                >
                  <Link
                    href={practice.href}
                    className={`flex aspect-square w-[110px] shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br ${practice.gradient} text-5xl text-white`}
                  >
                    {practice.symbol}
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link
                      href={practice.href}
                      className="line-clamp-2 text-[17px] font-semibold leading-6"
                    >
                      {practice.title}
                    </Link>

                    <p className="mt-1 text-sm font-medium text-[#7042c5]">
                      {practice.author}
                    </p>

                    <p className="mt-1 text-sm text-[#7d70a2]">
                      {practice.type} · {practice.duration}
                    </p>

                    <div className="mt-auto flex items-center justify-between pt-3">
                      <Link
                        href={practice.href}
                        className="flex items-center gap-2 font-medium text-[#7042c5]"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7042c5] text-white">
                          <PlayIcon />
                        </span>
                        Слушать
                      </Link>

                      <button
                        type="button"
                        aria-label="Удалить из избранного"
                        className="text-2xl text-[#7042c5]"
                      >
                        ♥
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] p-5">
            <h2 className="text-lg font-semibold text-[#7042c5]">
              Сохраняйте то, что откликается
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#70628e]">
              Нажимайте на сердечко возле практики, программы или автора, чтобы
              быстро вернуться к ним позже.
            </p>

            <Link
              href="/catalog"
              className="mt-4 inline-flex rounded-[16px] bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
            >
              Перейти в каталог
            </Link>
          </section>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}