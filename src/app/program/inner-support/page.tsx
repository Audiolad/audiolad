import Link from "next/link";

const programDays = [
  {
    day: "День 1",
    title: "Возвращение к себе",
    type: "Медитация",
    duration: "14 мин",
    symbol: "◯",
    gradient: "from-[#7652bc] to-[#b991dd]",
  },
  {
    day: "День 2",
    title: "Освобождение от напряжения",
    type: "Энергопрактика",
    duration: "17 мин",
    symbol: "✦",
    gradient: "from-[#a274dc] to-[#e1b4ed]",
  },
  {
    day: "День 3",
    title: "Мои личные границы",
    type: "Энергопрактика",
    duration: "17 мин",
    symbol: "◯",
    gradient: "from-[#7652bc] via-[#bd8fd7] to-[#f1c5d3]",
  },
  {
    day: "День 4",
    title: "Спокойствие внутри",
    type: "Медитация",
    duration: "15 мин",
    symbol: "☾",
    gradient: "from-[#6570b5] to-[#b8a3df]",
  },
  {
    day: "День 5",
    title: "Сила собственного решения",
    type: "Практика",
    duration: "18 мин",
    symbol: "✧",
    gradient: "from-[#d2a95e] to-[#b781d2]",
  },
  {
    day: "День 6",
    title: "Внутренняя опора",
    type: "Энергопрактика",
    duration: "16 мин",
    symbol: "♡",
    gradient: "from-[#e9b6d1] to-[#9b73ce]",
  },
  {
    day: "День 7",
    title: "Закрепление нового состояния",
    type: "Медитация",
    duration: "20 мин",
    symbol: "❀",
    gradient: "from-[#b58bdb] to-[#f1cedd]",
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

export default function InnerSupportProgramPage() {
  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] pb-10 shadow-sm">
        <div className="px-5 pt-5">
          <header className="flex items-center justify-between">
            <Link
              href="/catalog"
              aria-label="Назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <BackIcon />
            </Link>

            <p className="text-sm font-medium text-[#7d70a2]">Программа</p>

            <button
              type="button"
              aria-label="Добавить в избранное"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-2xl text-[#7042c5]"
            >
              ♡
            </button>
          </header>

          <section className="mt-6">
            <div className="relative aspect-square overflow-hidden rounded-[34px] bg-gradient-to-br from-[#5f3fa8] via-[#9470cb] to-[#e2b7d9] shadow-[0_24px_52px_rgba(91,62,145,0.22)]">
              <div className="absolute -left-16 -top-16 h-64 w-64 rounded-full bg-white/15 blur-3xl" />

              <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                <div className="flex h-40 w-40 items-center justify-center rounded-full border border-white/40 bg-white/10 text-[90px]">
                  ◯
                </div>

                <p className="mt-5 text-sm uppercase tracking-[0.22em] text-white/70">
                  7 дней
                </p>
              </div>

              <span className="absolute left-5 top-5 rounded-full bg-white/85 px-4 py-2 text-xs font-semibold text-[#7042c5]">
                Программа практик
              </span>
            </div>
          </section>

          <section className="mt-6">
            <h1 className="text-[32px] font-semibold leading-[1.15]">
              7 дней внутренней опоры
            </h1>

            <Link
              href="/authors/sergey-and-zoya"
              className="mt-3 inline-block font-medium text-[#7042c5]"
            >
              Сергей и Зоя
            </Link>

            <div className="mt-4 flex flex-wrap gap-2">
              {["7 практик", "1 ч 57 мин", "Для начинающих"].map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-[#f4ecfb] px-3 py-2 text-xs text-[#6d5d92]"
                >
                  {item}
                </span>
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
            <p className="text-[15px] leading-7 text-[#65577f]">
              Последовательная программа на семь дней для возвращения внимания
              к себе, укрепления личных границ и формирования спокойной
              внутренней опоры.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-[18px] bg-[#faf6ff] p-4">
                <p className="text-xs text-[#8a7ca9]">Режим прохождения</p>
                <p className="mt-2 text-sm font-medium">1 практика в день</p>
              </div>

              <div className="rounded-[18px] bg-[#faf6ff] p-4">
                <p className="text-xs text-[#8a7ca9]">Доступ</p>
                <p className="mt-2 text-sm font-medium">Без ограничений</p>
              </div>
            </div>
          </section>

          <section className="mt-7">
            <h2 className="text-[22px] font-semibold">Содержание программы</h2>

            <div className="mt-4 space-y-3">
              {programDays.map((item, index) => (
                <article
                  key={item.title}
                  className="flex items-center gap-3 rounded-[22px] border border-[#eadff8] bg-white p-3"
                >
                  <div
                    className={`flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br ${item.gradient} text-3xl text-white`}
                  >
                    {item.symbol}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[#7042c5]">
                      {item.day}
                    </p>

                    <h3 className="mt-1 text-[15px] font-semibold leading-5">
                      {item.title}
                    </h3>

                    <p className="mt-1 text-xs text-[#8a7ca9]">
                      {item.type} · {item.duration}
                    </p>
                  </div>

                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      index === 0
                        ? "bg-[#7042c5] text-white"
                        : "bg-[#f1e8fa] text-[#9b8bad]"
                    }`}
                  >
                    {index === 0 ? <PlayIcon /> : "🔒"}
                  </span>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <h2 className="text-[22px] font-semibold">
              Что изменится за 7 дней
            </h2>

            <div className="mt-4 space-y-3">
              {[
                "Станет легче замечать собственные чувства и желания",
                "Появится больше внутреннего спокойствия",
                "Укрепится ощущение личного пространства",
                "Станет проще принимать решения без внешнего давления",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-[18px] bg-[#faf6ff] px-4 py-3"
                >
                  <span className="mt-0.5 text-[#7042c5]">✓</span>
                  <p className="text-sm leading-6 text-[#65577f]">{item}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-7 rounded-[26px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] p-5 text-white shadow-[0_14px_34px_rgba(96,59,168,0.24)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white/75">Стоимость программы</p>
                <p className="mt-1 text-[30px] font-semibold">1 888 ₽</p>
                <p className="mt-1 text-xs text-white/70">
                  Все 7 практик включены
                </p>
              </div>

              <button
                type="button"
                className="rounded-[18px] bg-white px-6 py-4 font-semibold text-[#7042c5]"
              >
                Купить
              </button>
            </div>
          </section>

          <section className="mt-5 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] p-5">
            <h2 className="text-lg font-semibold">Как проходить программу</h2>

            <p className="mt-3 text-sm leading-6 text-[#70628e]">
              Проходите одну практику в день. После завершения текущего дня
              открывается следующий материал. При необходимости практику можно
              повторить перед переходом дальше.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}