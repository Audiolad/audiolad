import BottomNav from "@/components/BottomNav";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";
import Link from "next/link";

const purchases = [
  {
    title: "Мои личные границы",
    author: "Сергей и Зоя",
    type: "Энергопрактика",
    duration: "17 мин",
    price: "199 ₽",
    date: "5 июля 2026",
    symbol: "◯",
    gradient: "from-[#7652bc] via-[#bd8fd7] to-[#f1c5d3]",
    href: "/practice/personal-boundaries",
  },
  {
    title: "7 дней внутренней опоры",
    author: "Сергей и Зоя",
    type: "Программа",
    duration: "7 практик",
    price: "1 888 ₽",
    date: "28 июня 2026",
    symbol: "✦",
    gradient: "from-[#5f3fa8] via-[#9470cb] to-[#e2b7d9]",
    href: "/program/inner-support",
  },
  {
    title: "Сила женственности",
    author: "Зоя Петрова",
    type: "Медитация",
    duration: "16 мин",
    price: "199 ₽",
    date: "19 июня 2026",
    symbol: "♡",
    gradient: "from-[#f9d6e9] via-[#e7b9ec] to-[#9d78df]",
    href: "/authors/zoya-petrova",
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

export default function PurchasesPage() {
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
              <h1 className="text-[26px] font-semibold">Мои покупки</h1>
              <p className="mt-1 text-xs text-[#7d70a2]">
                Все приобретённые материалы
              </p>
            </div>

            <div className="h-11 w-11" />
          </header>

          <section className="mt-7 rounded-[26px] bg-gradient-to-br from-[#7042c5] to-[#9a74d8] p-5 text-white shadow-[0_14px_34px_rgba(96,59,168,0.22)]">
            <p className="text-sm text-white/70">В вашей коллекции</p>

            <div className="mt-3 grid grid-cols-3 gap-3">
              {[
                ["24", "материала"],
                ["18", "практик"],
                ["6", "программ"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-[18px] bg-white/10 px-2 py-3 text-center"
                >
                  <p className="text-xl font-semibold">{value}</p>
                  <p className="mt-1 text-[10px] text-white/65">{label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {["Все", "Практики", "Программы", "Аудиокурсы"].map(
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
              <h2 className="text-[21px] font-semibold">Последние покупки</h2>

              <button
                type="button"
                className="text-sm font-medium text-[#7042c5]"
              >
                Сначала новые⌄
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {purchases.map((purchase) => (
                <article
                  key={purchase.title}
                  className="rounded-[24px] border border-[#eadff8] bg-white p-3 shadow-[0_8px_22px_rgba(91,62,145,0.06)]"
                >
                  <div className="flex gap-4">
                    <Link
                      href={purchase.href}
                      className={`flex aspect-square w-[108px] shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br ${purchase.gradient} text-5xl text-white`}
                    >
                      {purchase.symbol}
                    </Link>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <Link
                        href={purchase.href}
                        className="line-clamp-2 text-[17px] font-semibold leading-6"
                      >
                        {purchase.title}
                      </Link>

                      <p className="mt-1 text-sm font-medium text-[#7042c5]">
                        {purchase.author}
                      </p>

                      <p className="mt-1 text-sm text-[#7d70a2]">
                        {purchase.type} · {purchase.duration}
                      </p>

                      <div className="mt-auto flex items-end justify-between pt-3">
                        <div>
                          <p className="text-sm font-semibold">
                            {purchase.price}
                          </p>
                          <p className="mt-1 text-[11px] text-[#8a7ca9]">
                            {purchase.date}
                          </p>
                        </div>

                        <Link
                          href={purchase.href}
                          aria-label={`Открыть ${purchase.title}`}
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7042c5] text-white"
                        >
                          <PlayIcon />
                        </Link>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-[#eee6f7] pt-3">
                    <span className="text-xs text-[#4b9b73]">
                      Доступ без ограничений
                    </span>

                    <button
                      type="button"
                      className="text-sm font-medium text-[#7042c5]"
                    >
                      Чек ›
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] p-5">
            <h2 className="text-lg font-semibold text-[#7042c5]">
              Все покупки сохраняются
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#70628e]">
              Приобретённые практики и программы остаются в вашем аккаунте и
              доступны с любого устройства.
            </p>

            <Link
              href="/catalog"
              className="mt-4 inline-flex rounded-[16px] bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
            >
              Найти новые практики
            </Link>
          </section>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}