import BottomNav from "@/components/BottomNav";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";
import Link from "next/link";

const historyItems = [
  {
    title: "Мои личные границы",
    author: "Сергей и Зоя",
    type: "Энергопрактика",
    duration: "17 мин",
    progress: "Прослушано полностью",
    time: "Сегодня, 09:42",
    symbol: "◯",
    gradient: "from-[#7652bc] via-[#bd8fd7] to-[#f1c5d3]",
    href: "/player/personal-boundaries",
    percent: "100%",
  },
  {
    title: "Утренняя настройка",
    author: "Зоя Петрова",
    type: "Медитация",
    duration: "12 мин",
    progress: "Осталось 4 минуты",
    time: "Сегодня, 07:18",
    symbol: "☀",
    gradient: "from-[#f0c98e] via-[#e9b8bd] to-[#b487d7]",
    href: "/authors/zoya-petrova",
    percent: "68%",
  },
  {
    title: "Внутренняя опора",
    author: "Сергей Петров",
    type: "Энергопрактика",
    duration: "15 мин",
    progress: "Прослушано полностью",
    time: "Вчера, 21:36",
    symbol: "✦",
    gradient: "from-[#5f62a9] via-[#8877c8] to-[#c4b2e5]",
    href: "/authors/sergey-petrov",
    percent: "100%",
  },
  {
    title: "Эликсир молодости",
    author: "Сергей и Зоя",
    type: "Энергопрактика",
    duration: "18 мин",
    progress: "Осталось 7 минут",
    time: "3 июля, 10:05",
    symbol: "❀",
    gradient: "from-[#a274dc] via-[#e1b4ed] to-[#f6d8ec]",
    href: "/authors/sergey-and-zoya",
    percent: "61%",
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

export default function HistoryPage() {
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
              <h1 className="text-[26px] font-semibold">История</h1>
              <p className="mt-1 text-xs text-[#7d70a2]">
                Недавно прослушанные материалы
              </p>
            </div>

            <button
              type="button"
              className="h-11 w-11 text-sm font-medium text-[#7042c5]"
            >
              Очистить
            </button>
          </header>

          <section className="mt-7">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {["Все", "Сегодня", "Неделя", "Месяц"].map((item, index) => (
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
              ))}
            </div>
          </section>

          <section className="mt-7">
            <div className="flex items-center justify-between">
              <h2 className="text-[21px] font-semibold">
                Последние прослушивания
              </h2>

              <p className="text-sm text-[#7d70a2]">{historyItems.length}</p>
            </div>

            <div className="mt-5 space-y-4">
              {historyItems.map((item) => (
                <article
                  key={`${item.title}-${item.time}`}
                  className="rounded-[24px] border border-[#eadff8] bg-white p-3 shadow-[0_8px_22px_rgba(91,62,145,0.06)]"
                >
                  <div className="flex gap-4">
                    <Link
                      href={item.href}
                      className={`flex aspect-square w-[108px] shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br ${item.gradient} text-5xl text-white`}
                    >
                      {item.symbol}
                    </Link>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <Link
                        href={item.href}
                        className="line-clamp-2 text-[17px] font-semibold leading-6"
                      >
                        {item.title}
                      </Link>

                      <p className="mt-1 text-sm font-medium text-[#7042c5]">
                        {item.author}
                      </p>

                      <p className="mt-1 text-sm text-[#7d70a2]">
                        {item.type} · {item.duration}
                      </p>

                      <div className="mt-auto flex items-end justify-between pt-3">
                        <div className="min-w-0 flex-1 pr-3">
                          <div className="h-1.5 overflow-hidden rounded-full bg-[#eee6f7]">
                            <div
                              className="h-full rounded-full bg-[#7042c5]"
                              style={{ width: item.percent }}
                            />
                          </div>

                          <p className="mt-2 text-[11px] text-[#8a7ca9]">
                            {item.progress}
                          </p>
                        </div>

                        <Link
                          href={item.href}
                          aria-label={`Продолжить ${item.title}`}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-white"
                        >
                          <PlayIcon />
                        </Link>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-[#eee6f7] pt-3">
                    <p className="text-xs text-[#8a7ca9]">{item.time}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] p-5">
            <h2 className="text-lg font-semibold text-[#7042c5]">
              Продолжайте с того же места
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#70628e]">
              АудиоЛад запоминает место остановки, чтобы вы могли продолжить
              прослушивание на любом устройстве.
            </p>
          </section>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}