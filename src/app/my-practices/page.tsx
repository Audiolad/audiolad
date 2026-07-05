import Link from "next/link";

const practices = [
  {
    title: "Эликсир Молодости",
    author: "Сергей и Зоя",
    type: "Медитация",
    duration: "18 мин",
    status: "Бесплатно",
    symbol: "❀",
    gradient: "from-[#a274dc] via-[#e1b4ed] to-[#f6d8ec]",
  },
  {
    title: "Ключ к Изобилию",
    author: "Сергей и Зоя",
    type: "Энергопрактика",
    duration: "21 мин",
    status: "Бесплатно",
    symbol: "⚿",
    gradient: "from-[#e6b35b] via-[#f4dba4] to-[#b986da]",
  },
  {
    title: "Сила Женственности",
    author: "Зоя Петрова",
    type: "Медитация",
    duration: "16 мин",
    status: "Куплено",
    symbol: "♡",
    gradient: "from-[#f9d6e9] via-[#e7b9ec] to-[#9d78df]",
  },
  {
    title: "Связь с Душой",
    author: "Сергей Петров",
    type: "Энергопоток",
    duration: "14 мин",
    status: "Куплено",
    symbol: "✦",
    gradient: "from-[#5851a2] via-[#8977d3] to-[#cbb6ed]",
  },
  {
    title: "Мои личные границы",
    author: "Сергей и Зоя",
    type: "Энергопрактика",
    duration: "17 мин",
    status: "Куплено",
    symbol: "◯",
    gradient: "from-[#7d5bc5] via-[#c095df] to-[#f4d7c6]",
  },
];

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

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

export default function MyPracticesPage() {
  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] pb-28 shadow-sm">
        <div className="px-5 pt-6">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-[28px] font-semibold">Мои практики</h1>
              <p className="mt-1 text-sm text-[#7d70a2]">
                Всё сохранённое и приобретённое
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

          <div className="-mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-2">
            {["Все", "Купленные", "Бесплатные", "Скачанные", "Программы"].map(
              (item, index) => (
                <button
                  key={item}
                  type="button"
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm ${
                    index === 0
                      ? "border-[#7042c5] bg-[#7042c5] text-white"
                      : "border-[#e2d7f2] bg-white text-[#25135c]"
                  }`}
                >
                  {item}
                </button>
              ),
            )}
          </div>

          <section className="mt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[#7d70a2]">Сохранено: 24</p>

              <button
                type="button"
                className="text-sm font-medium text-[#7042c5]"
              >
                Сначала новые⌄
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {practices.map((practice) => (
                <article
                  key={practice.title}
                  className="flex gap-4 rounded-[24px] border border-[#eadff8] bg-white p-3 shadow-[0_8px_22px_rgba(91,62,145,0.06)]"
                >
                  <div
                    className={`relative aspect-square w-[112px] shrink-0 overflow-hidden rounded-[20px] bg-gradient-to-br ${practice.gradient}`}
                  >
                    <span className="absolute left-2 top-2 rounded-full bg-white/80 px-2 py-1 text-[10px] font-medium text-[#7042c5]">
                      {practice.status}
                    </span>

                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/50 bg-white/15 text-4xl text-white">
                        {practice.symbol}
                      </div>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <h2 className="line-clamp-2 text-[17px] font-semibold leading-6">
                      {practice.title}
                    </h2>

                    <Link
                      href="/authors"
                      className="mt-1 text-sm font-medium text-[#7042c5]"
                    >
                      {practice.author}
                    </Link>

                    <p className="mt-1 text-sm text-[#7d70a2]">
                      {practice.type} · {practice.duration}
                    </p>

                    <div className="mt-auto flex items-center justify-between pt-3">
                      <button
                        type="button"
                        className="flex items-center gap-2 font-medium text-[#7042c5]"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7042c5] text-white">
                          <PlayIcon />
                        </span>
                        Слушать
                      </button>

                      <button
                        type="button"
                        aria-label="Дополнительное меню"
                        className="px-2 text-2xl leading-none text-[#8f82ad]"
                      >
                        ···
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
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
            className="flex min-w-[72px] flex-col items-center gap-1 text-[11px] text-[#81759f]"
          >
            <span className="text-[25px] leading-none">▦</span>
            <span>Каталог</span>
          </Link>

          <Link
            href="/my-practices"
            className="flex min-w-[72px] flex-col items-center gap-1 text-[11px] text-[#7042c5]"
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

          <button
            type="button"
            className="flex min-w-[72px] flex-col items-center gap-1 text-[11px] text-[#81759f]"
          >
            <span className="text-[25px] leading-none">◎</span>
            <span>Профиль</span>
          </button>
        </nav>
      </div>
    </main>
  );
}