import Link from "next/link";

const playlists = [
  {
    title: "Утро в ресурсе",
    count: "6 практик",
    duration: "52 мин",
    description: "Мягкое пробуждение, энергия и настройка на день.",
    symbols: ["❀", "✦", "☀"],
    gradients: [
      "from-[#f5d7e7] to-[#bd91df]",
      "from-[#d9c9f3] to-[#8f73cd]",
      "from-[#f4d6aa] to-[#d399c9]",
    ],
  },
  {
    title: "Деньги и проявленность",
    count: "8 практик",
    duration: "1 ч 14 мин",
    description: "Изобилие, уверенность, ценность и движение к цели.",
    symbols: ["₽", "◈", "✧"],
    gradients: [
      "from-[#f5dc9e] to-[#bb82d4]",
      "from-[#d7c2ed] to-[#7761b8]",
      "from-[#f0cfa8] to-[#a77cc6]",
    ],
  },
  {
    title: "Спокойный вечер",
    count: "5 практик",
    duration: "44 мин",
    description: "Отпускание напряжения, тишина и спокойный сон.",
    symbols: ["☾", "♡", "✦"],
    gradients: [
      "from-[#6870b7] to-[#c9b7ea]",
      "from-[#b999d7] to-[#e3c9e7]",
      "from-[#5367a8] to-[#9f8bd3]",
    ],
  },
  {
    title: "Любовь к себе",
    count: "7 практик",
    duration: "58 мин",
    description: "Принятие себя, мягкость, границы и внутренняя опора.",
    symbols: ["♡", "❀", "◯"],
    gradients: [
      "from-[#f0bcd1] to-[#af7ed2]",
      "from-[#e6c5e5] to-[#9371cd]",
      "from-[#efc9d4] to-[#c397df]",
    ],
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

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <path
        d="M12 5v14M5 12h14"
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

export default function PlaylistsPage() {
  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] pb-28 shadow-sm">
        <div className="px-5 pt-6">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-[28px] font-semibold">Плейлисты</h1>
              <p className="mt-1 text-sm text-[#7d70a2]">
                Ваши подборки для разных состояний
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

          <button
            type="button"
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-[22px] border border-dashed border-[#bfa8e3] bg-[#faf6ff] px-5 py-4 font-medium text-[#7042c5]"
          >
            <PlusIcon />
            Создать новый плейлист
          </button>

          <section className="mt-7">
            <div className="flex items-center justify-between">
              <h2 className="text-[21px] font-semibold">Мои плейлисты</h2>

              <button
                type="button"
                className="text-sm font-medium text-[#7042c5]"
              >
                Недавно изменённые⌄
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {playlists.map((playlist) => (
                <article
                  key={playlist.title}
                  className="rounded-[26px] border border-[#eadff8] bg-white p-4 shadow-[0_10px_28px_rgba(91,62,145,0.07)]"
                >
                  <div className="flex gap-4">
                    <div className="grid h-[118px] w-[118px] shrink-0 grid-cols-2 gap-1 overflow-hidden rounded-[22px] bg-[#f3ebfb] p-1">
                      {playlist.symbols.map((symbol, index) => (
                        <div
                          key={`${playlist.title}-${index}`}
                          className={`flex items-center justify-center bg-gradient-to-br ${
                            playlist.gradients[index]
                          } text-3xl text-white ${
                            index === 2 ? "col-span-2" : ""
                          }`}
                        >
                          {symbol}
                        </div>
                      ))}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col">
<Link
  href={
    playlist.title === "Утро в ресурсе"
      ? "/playlist/morning-energy"
      : "#"
  }
  className="text-[18px] font-semibold leading-6"
>
  {playlist.title}
</Link>

                      <p className="mt-1 text-sm text-[#7d70a2]">
                        {playlist.count} · {playlist.duration}
                      </p>

                      <p className="mt-2 line-clamp-2 text-sm leading-5 text-[#6f61a3]">
                        {playlist.description}
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
            className="flex min-w-[72px] flex-col items-center gap-1 text-[11px] text-[#81759f]"
          >
            <span className="text-[25px] leading-none">▥</span>
            <span>Мои практики</span>
          </Link>

          <Link
            href="/playlists"
            className="flex min-w-[72px] flex-col items-center gap-1 text-[11px] text-[#7042c5]"
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