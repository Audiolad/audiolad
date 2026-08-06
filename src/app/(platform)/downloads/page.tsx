import type { Metadata } from "next";
import BottomNav from "@/components/BottomNav";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo/private-robots";
import Link from "next/link";

export const metadata: Metadata = {
  robots: PRIVATE_PAGE_ROBOTS,
};

const downloadedItems = [
  {
    title: "Мои личные границы",
    author: "Сергей и Зоя",
    type: "Энергопрактика",
    duration: "17 мин",
    size: "24,8 МБ",
    date: "Скачано 5 июля",
    symbol: "◯",
    gradient: "from-[#7652bc] via-[#bd8fd7] to-[#f1c5d3]",
    href: "/player/personal-boundaries",
  },
  {
    title: "Сила женственности",
    author: "Зоя Петрова",
    type: "Медитация",
    duration: "16 мин",
    size: "22,1 МБ",
    date: "Скачано 2 июля",
    symbol: "♡",
    gradient: "from-[#f9d6e9] via-[#e7b9ec] to-[#9d78df]",
    href: "/authors/zoya-petrova",
  },
  {
    title: "Внутренняя опора",
    author: "Сергей Петров",
    type: "Энергопрактика",
    duration: "15 мин",
    size: "20,6 МБ",
    date: "Скачано 28 июня",
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

export default function DownloadsPage() {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}>
        <div className="px-5">
          <header className="flex items-center justify-between">
            <Link
              href="/profile"
              aria-label="Назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <BackIcon />
            </Link>

            <div className="text-center">
              <h1 className="text-[26px] font-semibold">Скачанные</h1>
              <p className="mt-1 text-xs text-[#7d70a2]">
                Доступны без интернета
              </p>
            </div>

            <button
              type="button"
              className="h-11 w-11 text-sm font-medium text-[#7042c5]"
            >
              Выбрать
            </button>
          </header>

          <section className="mt-7 rounded-[26px] bg-gradient-to-br from-[#7042c5] to-[#9a74d8] p-5 text-white shadow-[0_14px_34px_rgba(96,59,168,0.22)]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-white/70">Занято на устройстве</p>
                <p className="mt-2 text-[30px] font-semibold">67,5 МБ</p>
              </div>

              <span className="text-3xl">⇩</span>
            </div>

            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full w-[28%] rounded-full bg-white" />
            </div>

            <div className="mt-3 flex justify-between text-xs text-white/65">
              <span>3 материала</span>
              <span>Свободно 18,4 ГБ</span>
            </div>
          </section>

          <section className="mt-6">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {["Все", "Практики", "Программы"].map((item, index) => (
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
              <h2 className="text-[21px] font-semibold">На устройстве</h2>

              <p className="text-sm text-[#7d70a2]">
                {downloadedItems.length}
              </p>
            </div>

            <div className="mt-5 space-y-4">
              {downloadedItems.map((item) => (
                <article
                  key={item.title}
                  className="flex gap-4 rounded-[24px] border border-[#eadff8] bg-white p-3 shadow-[0_8px_22px_rgba(91,62,145,0.06)]"
                >
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
                      <div>
                        <p className="text-xs font-medium text-[#4b9b73]">
                          Доступно офлайн
                        </p>

                        <p className="mt-1 text-[11px] text-[#8a7ca9]">
                          {item.size} · {item.date}
                        </p>
                      </div>

                      <Link
                        href={item.href}
                        aria-label={`Слушать ${item.title}`}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-white"
                      >
                        <PlayIcon />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] p-5">
            <h2 className="text-lg font-semibold text-[#7042c5]">
              Слушайте без интернета
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#70628e]">
              Скачанные материалы остаются доступными в поездках и местах без
              устойчивого подключения к интернету.
            </p>

            <button
              type="button"
              className="mt-4 rounded-[16px] border border-[#bda6e1] bg-white px-5 py-3 text-sm font-semibold text-[#7042c5]"
            >
              Управление загрузками
            </button>
          </section>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}