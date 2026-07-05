import Link from "next/link";

const practices = [
  {
    title: "Мои личные границы",
    status: "Опубликовано",
    listens: "1 248",
    sales: "86",
    income: "17 114 ₽",
    symbol: "◯",
    gradient: "from-[#7652bc] via-[#bd8fd7] to-[#f1c5d3]",
  },
  {
    title: "Ключ к изобилию",
    status: "Опубликовано",
    listens: "2 741",
    sales: "143",
    income: "28 457 ₽",
    symbol: "✦",
    gradient: "from-[#e6b35b] via-[#f4dba4] to-[#b986da]",
  },
  {
    title: "Сила женственности",
    status: "На модерации",
    listens: "–",
    sales: "–",
    income: "–",
    symbol: "♡",
    gradient: "from-[#f9d6e9] via-[#e7b9ec] to-[#9d78df]",
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

export default function AuthorDashboardPage() {
  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] pb-10 shadow-sm">
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
              <h1 className="text-[22px] font-semibold">Кабинет автора</h1>
              <p className="mt-1 text-xs text-[#7d70a2]">Сергей и Зоя</p>
            </div>

            <button
              type="button"
              aria-label="Настройки"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-xl text-[#7042c5]"
            >
              ⚙
            </button>
          </header>

          <section className="mt-7 overflow-hidden rounded-[28px] bg-gradient-to-br from-[#7042c5] to-[#9a74d8] p-5 text-white shadow-[0_16px_38px_rgba(96,59,168,0.24)]">
            <p className="text-sm text-white/70">Доход за текущий месяц</p>

            <div className="mt-2 flex items-end justify-between">
              <p className="text-[34px] font-semibold">45 571 ₽</p>

              <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs">
                +18% к июню
              </span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                ["3", "практики"],
                ["229", "продаж"],
                ["3 989", "прослушиваний"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-[18px] bg-white/10 px-2 py-3 text-center"
                >
                  <p className="text-lg font-semibold">{value}</p>
                  <p className="mt-1 text-[10px] leading-4 text-white/65">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 grid grid-cols-2 gap-3">
<Link
  href="/author-dashboard/new-practice"
  className="flex items-center justify-center gap-2 rounded-[22px] bg-[#7042c5] px-4 py-4 font-semibold text-white"
>
  <PlusIcon />
  Новая практика
</Link>

            <button
              type="button"
              className="rounded-[22px] border border-[#c6afe6] bg-white px-4 py-4 font-semibold text-[#7042c5]"
            >
              Новая программа
            </button>
          </section>

          <section className="mt-7">
            <h2 className="text-[21px] font-semibold">Статистика</h2>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <article className="rounded-[22px] border border-[#eadff8] bg-white p-4">
                <p className="text-xs text-[#7d70a2]">Продажи за 30 дней</p>
                <p className="mt-2 text-[26px] font-semibold text-[#7042c5]">
                  229
                </p>
                <p className="mt-2 text-xs text-[#4b9b73]">↑ 12,4%</p>
              </article>

              <article className="rounded-[22px] border border-[#eadff8] bg-white p-4">
                <p className="text-xs text-[#7d70a2]">Средний чек</p>
                <p className="mt-2 text-[26px] font-semibold text-[#7042c5]">
                  199 ₽
                </p>
                <p className="mt-2 text-xs text-[#7d70a2]">за покупку</p>
              </article>

              <article className="rounded-[22px] border border-[#eadff8] bg-white p-4">
                <p className="text-xs text-[#7d70a2]">Слушатели</p>
                <p className="mt-2 text-[26px] font-semibold text-[#7042c5]">
                  2 184
                </p>
                <p className="mt-2 text-xs text-[#4b9b73]">↑ 8,1%</p>
              </article>

              <article className="rounded-[22px] border border-[#eadff8] bg-white p-4">
                <p className="text-xs text-[#7d70a2]">В избранном</p>
                <p className="mt-2 text-[26px] font-semibold text-[#7042c5]">
                  642
                </p>
                <p className="mt-2 text-xs text-[#7d70a2]">добавления</p>
              </article>
            </div>
          </section>

          <section className="mt-7">
            <div className="flex items-center justify-between">
              <h2 className="text-[21px] font-semibold">Мои материалы</h2>

              <button
                type="button"
                className="text-sm font-medium text-[#7042c5]"
              >
                Смотреть все ›
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {practices.map((practice) => (
                <article
                  key={practice.title}
                  className="rounded-[24px] border border-[#eadff8] bg-white p-3 shadow-[0_8px_22px_rgba(91,62,145,0.06)]"
                >
                  <div className="flex gap-4">
                    <div
                      className={`relative aspect-square w-[96px] shrink-0 overflow-hidden rounded-[20px] bg-gradient-to-br ${practice.gradient}`}
                    >
                      <div className="absolute inset-0 flex items-center justify-center text-4xl text-white">
                        {practice.symbol}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-[16px] font-semibold leading-5">
                          {practice.title}
                        </h3>

                        <button
                          type="button"
                          className="text-xl leading-none text-[#8f82ad]"
                        >
                          ···
                        </button>
                      </div>

                      <span
                        className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[10px] font-medium ${
                          practice.status === "Опубликовано"
                            ? "bg-[#eaf7ef] text-[#3d8d65]"
                            : "bg-[#fff4df] text-[#b67a1d]"
                        }`}
                      >
                        {practice.status}
                      </span>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-sm font-semibold">
                            {practice.listens}
                          </p>
                          <p className="mt-1 text-[9px] text-[#8a7ca9]">
                            слушают
                          </p>
                        </div>

                        <div>
                          <p className="text-sm font-semibold">
                            {practice.sales}
                          </p>
                          <p className="mt-1 text-[9px] text-[#8a7ca9]">
                            продаж
                          </p>
                        </div>

                        <div>
                          <p className="text-sm font-semibold">
                            {practice.income}
                          </p>
                          <p className="mt-1 text-[9px] text-[#8a7ca9]">
                            доход
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <h2 className="text-[21px] font-semibold">Управление</h2>

            <div className="mt-4 overflow-hidden rounded-[22px] border border-[#eadff8] bg-white">
              {[
                ["Статистика и аналитика", "▥"],
                ["Продажи и заказы", "₽"],
                ["Выплаты", "⇩"],
                ["Отзывы слушателей", "♡"],
                ["Профиль автора", "◎"],
              ].map(([title, icon], index, items) => (
                <button
                  key={title}
                  type="button"
                  className={`flex w-full items-center justify-between px-5 py-4 ${
                    index !== items.length - 1
                      ? "border-b border-[#eee6f7]"
                      : ""
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f4ecfb] text-[#7042c5]">
                      {icon}
                    </span>
                    <span>{title}</span>
                  </span>

                  <span className="text-xl text-[#7042c5]">›</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}