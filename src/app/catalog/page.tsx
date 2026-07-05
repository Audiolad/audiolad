import Link from "next/link";

const categories = [
  {
    title: "Любовь и отношения",
    count: "142 практики",
    icon: "♡",
    gradient: "from-[#f9d7e8] to-[#efd6f4]",
  },
  {
    title: "Деньги и изобилие",
    count: "128 практик",
    icon: "₽",
    gradient: "from-[#f7dfb8] to-[#f3d4a0]",
  },
  {
    title: "Спокойствие и сон",
    count: "116 практик",
    icon: "☾",
    gradient: "from-[#d9def8] to-[#c7d5f2]",
  },
  {
    title: "Энергия и восстановление",
    count: "103 практики",
    icon: "✦",
    gradient: "from-[#d7e4f7] to-[#d8d6f3]",
  },
  {
    title: "Саморазвитие и рост",
    count: "98 практик",
    icon: "♧",
    gradient: "from-[#e4e0d5] to-[#e9daca]",
  },
  {
    title: "Очищение и защита",
    count: "88 практик",
    icon: "◈",
    gradient: "from-[#d7d8f2] to-[#e1d4ef]",
  },
  {
    title: "Духовность и осознанность",
    count: "96 практик",
    icon: "❀",
    gradient: "from-[#ded6ed] to-[#ece0f2]",
  },
  {
    title: "Уверенность и мотивация",
    count: "75 практик",
    icon: "△",
    gradient: "from-[#f2d5c8] to-[#dacceb]",
  },
  {
    title: "Женские практики",
    count: "67 практик",
    icon: "♀",
    gradient: "from-[#f1d6df] to-[#e9d4ec]",
  },
  {
    title: "Мужские практики",
    count: "54 практики",
    icon: "♂",
    gradient: "from-[#d9d6e6] to-[#ddcfdf]",
  },
];

const formats = [
  ["Медитации", "341 практика"],
  ["Энергопрактики", "289 практик"],
  ["Молитвы", "142 практики"],
  ["Курсы и программы", "67 программ"],
  ["Аффирмации", "218 практик"],
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

export default function CatalogPage() {
  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] pb-28 shadow-sm">
        <div className="px-5 pt-6">
          <header className="flex items-center justify-between">
            <Link
              href="/"
              aria-label="Назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-3xl text-[#7042c5]"
            >
              ‹
            </Link>

            <h1 className="text-[28px] font-semibold">Каталог практик</h1>

            <button
              type="button"
              aria-label="Поиск"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <SearchIcon />
            </button>
          </header>

          <label className="mt-6 flex items-center gap-3 rounded-[22px] border border-[#ded1f1] bg-white px-4 py-3.5">
            <span className="text-[#7042c5]">
              <SearchIcon />
            </span>

            <input
              type="search"
              placeholder="Поиск практик, авторов и тем"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#9485b4]"
            />
          </label>

          <div className="-mx-5 mt-5 flex gap-2 overflow-x-auto px-5 pb-2">
            {[
              "Все",
              "Медитации",
              "Энергопрактики",
              "Молитвы",
              "Курсы",
              "Аффирмации",
            ].map((item, index) => (
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
            ))}
          </div>

          <section className="mt-6">
            <h2 className="text-[22px] font-semibold">Категории</h2>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {categories.map((category) => (
                <button
                  key={category.title}
                  type="button"
                  className={`min-h-[142px] rounded-[24px] bg-gradient-to-br ${category.gradient} p-4 text-left`}
                >
                  <span className="text-4xl text-[#7042c5]">
                    {category.icon}
                  </span>

                  <span className="mt-4 block text-[16px] font-semibold leading-5">
                    {category.title}
                  </span>

                  <span className="mt-2 block text-sm text-[#76679d]">
                    {category.count}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-[22px] font-semibold">Форматы</h2>

            <div className="mt-4 overflow-hidden rounded-[22px] border border-[#e8def5] bg-white">
              {formats.map(([title, count], index) => (
                <button
                  key={title}
                  type="button"
                  className={`flex w-full items-center justify-between px-5 py-4 text-left ${
                    index !== formats.length - 1
                      ? "border-b border-[#eee6f7]"
                      : ""
                  }`}
                >
                  <span className="font-medium">{title}</span>

                  <span className="flex items-center gap-2 text-sm text-[#8a7ca9]">
                    {count}
                    <span className="text-xl text-[#7042c5]">›</span>
                  </span>
                </button>
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