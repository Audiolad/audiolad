import Link from "next/link"; import BottomNav from "@/components/BottomNav";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";

const playlistItems = [
  {
    number: "01",
    title: "Эликсир молодости",
    author: "Сергей и Зоя",
    duration: "18 мин",
    symbol: "❀",
    gradient: "from-[#a274dc] via-[#e1b4ed] to-[#f6d8ec]",
  },
  {
    number: "02",
    title: "Ключ к изобилию",
    author: "Сергей и Зоя",
    duration: "21 мин",
    symbol: "✦",
    gradient: "from-[#e6b35b] via-[#f4dba4] to-[#b986da]",
  },
  {
    number: "03",
    title: "Утренняя настройка",
    author: "Зоя Петрова",
    duration: "12 мин",
    symbol: "☀",
    gradient: "from-[#f0c98e] via-[#e9b8bd] to-[#b487d7]",
  },
  {
    number: "04",
    title: "Внутренняя опора",
    author: "Сергей Петров",
    duration: "15 мин",
    symbol: "◯",
    gradient: "from-[#6f69b5] via-[#9d88d5] to-[#d6c4ee]",
  },
  {
    number: "05",
    title: "Благодарность новому дню",
    author: "Сергей и Зоя",
    duration: "14 мин",
    symbol: "♡",
    gradient: "from-[#f4c9d9] via-[#d9a8de] to-[#9971cd]",
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
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

export default function MorningEnergyPlaylistPage() {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}>
        <div className="px-5 pt-5">
          <header className="flex items-center justify-between">
            <Link
              href="/playlists"
              aria-label="Назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <BackIcon />
            </Link>

            <p className="text-sm font-medium text-[#7d70a2]">Плейлист</p>

            <button
              type="button"
              aria-label="Дополнительное меню"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-2xl text-[#7042c5]"
            >
              ···
            </button>
          </header>

          <section className="mt-6">
            <div className="relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-[34px] bg-[#f4ebfb] p-2 shadow-[0_22px_50px_rgba(91,62,145,0.18)]">
              <div className="grid h-full grid-cols-2 gap-2">
                <div className="flex items-center justify-center rounded-[26px] bg-gradient-to-br from-[#f5d7e7] to-[#bd91df] text-7xl text-white">
                  ❀
                </div>

                <div className="flex items-center justify-center rounded-[26px] bg-gradient-to-br from-[#d9c9f3] to-[#8f73cd] text-7xl text-white">
                  ✦
                </div>

                <div className="col-span-2 flex items-center justify-center rounded-[26px] bg-gradient-to-br from-[#f4d6aa] to-[#d399c9] text-8xl text-white">
                  ☀
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6 text-center">
            <h1 className="text-[31px] font-semibold">Утро в ресурсе</h1>

            <p className="mt-3 text-sm leading-6 text-[#70628e]">
              Мягкое пробуждение, энергия и настройка на новый день.
            </p>

            <p className="mt-3 text-sm text-[#8a7ca9]">
              5 практик · 1 ч 20 мин
            </p>
          </section>

          <section className="mt-6 grid grid-cols-[1fr_auto] gap-3">
            <button
              type="button"
              className="flex items-center justify-center gap-3 rounded-[22px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-5 py-4 font-semibold text-white shadow-[0_14px_34px_rgba(96,59,168,0.22)]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#7042c5]">
                <PlayIcon />
              </span>
              Слушать всё
            </button>

            <button
              type="button"
              aria-label="Добавить в избранное"
              className="flex h-[64px] w-[64px] items-center justify-center rounded-[22px] border border-[#d8c7ee] bg-white text-2xl text-[#7042c5]"
            >
              ♡
            </button>
          </section>

          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-[22px] font-semibold">Практики</h2>

              <button
                type="button"
                className="text-sm font-medium text-[#7042c5]"
              >
                Изменить
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {playlistItems.map((item) => (
                <article
                  key={item.title}
                  className="flex items-center gap-3 rounded-[22px] border border-[#eadff8] bg-white p-3 shadow-[0_7px_20px_rgba(91,62,145,0.05)]"
                >
                  <span className="w-6 text-center text-xs text-[#a193b9]">
                    {item.number}
                  </span>

                  <div
                    className={`flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br ${item.gradient} text-3xl text-white`}
                  >
                    {item.symbol}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-[15px] font-semibold leading-5">
                      {item.title}
                    </h3>

                    <p className="mt-1 text-xs text-[#7042c5]">
                      {item.author}
                    </p>

                    <p className="mt-1 text-xs text-[#8a7ca9]">
                      {item.duration}
                    </p>
                  </div>

                  <button
                    type="button"
                    aria-label={`Воспроизвести ${item.title}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f1e8fa] pl-0.5 text-[#7042c5]"
                  >
                    <PlayIcon />
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-7 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] p-5">
            <h2 className="text-lg font-semibold">О плейлисте</h2>

            <p className="mt-3 text-sm leading-6 text-[#70628e]">
              Начните утро без спешки. Практики в этой подборке помогают
              пробудиться, почувствовать тело, вернуть внимание к себе и
              настроиться на спокойный и продуктивный день.
            </p>
          </section>
        </div>

<BottomNav />
      </div>
    </main>
  );
}