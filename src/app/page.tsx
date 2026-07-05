import Image from "next/image";import Link from "next/link";

const categories = [
  { icon: "♡", title: "Любовь и отношения" },
  { icon: "₽", title: "Деньги и изобилие" },
  { icon: "☾", title: "Спокойствие и сон" },
  { icon: "✦", title: "Энергия и здоровье" },
  { icon: "◈", title: "Границы и защита" },
];

const popularPractices = [
  {
    title: "Сила Женственности",
    price: "199 ₽",
    gradient: "from-[#f9d6e9] via-[#e7b9ec] to-[#9d78df]",
    symbol: "♡",
  },
  {
    title: "Проводник. Внутренний наставник",
    price: "299 ₽",
    gradient: "from-[#57448d] via-[#8f72cc] to-[#e2bfef]",
    symbol: "✦",
  },
  {
    title: "Мои личные границы",
    price: "199 ₽",
    gradient: "from-[#7d5bc5] via-[#c095df] to-[#f4d7c6]",
    symbol: "◯",
  },
];

const freePractices = [
  {
    title: "Эликсир Молодости",
    gradient: "from-[#a274dc] via-[#e1b4ed] to-[#f6d8ec]",
    symbol: "❀",
  },
  {
    title: "Ключ к Изобилию",
    gradient: "from-[#e6b35b] via-[#f4dba4] to-[#b986da]",
    symbol: "⚿",
  },
  {
    title: "Код Притяжения",
    gradient: "from-[#7a4cbf] via-[#d17ed2] to-[#f6b9d5]",
    symbol: "♡",
  },
];

const newPractices = [
  {
    title: "Связь с Душой",
    price: "199 ₽",
    gradient: "from-[#5851a2] via-[#8977d3] to-[#cbb6ed]",
    symbol: "✧",
  },
  {
    title: "Внутренняя опора",
    price: "249 ₽",
    gradient: "from-[#7a5fa8] via-[#b68bc5] to-[#e8c5d1]",
    symbol: "♧",
  },
  {
    title: "Денежный поток",
    price: "299 ₽",
    gradient: "from-[#e2a85d] via-[#d5b07c] to-[#926fd0]",
    symbol: "₽",
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

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <circle
        cx="12"
        cy="8"
        r="4"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M4.5 21c.8-4.4 3.3-6.5 7.5-6.5s6.7 2.1 7.5 6.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PracticeCard({
  title,
  price,
  gradient,
  symbol,
  free = false,
}: {
  title: string;
  price?: string;
  gradient: string;
  symbol: string;
  free?: boolean;
}) {
  return (
    <article className="w-[148px] shrink-0">
      <div
        className={`relative aspect-square overflow-hidden rounded-[22px] bg-gradient-to-br ${gradient} shadow-sm`}
      >
        {free && (
          <span className="absolute left-3 top-3 rounded-full bg-[#6f3dcc] px-3 py-1 text-[11px] font-medium text-white">
            Бесплатно
          </span>
        )}

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/50 bg-white/15 text-5xl text-white shadow-[0_0_30px_rgba(255,255,255,0.45)]">
            {symbol}
          </div>
        </div>
      </div>

      <h3 className="mt-3 line-clamp-2 min-h-[44px] text-[15px] font-medium leading-[22px] text-[#25135c]">
        {title}
      </h3>

      {price && (
        <p className="mt-1 font-semibold text-[#7042c5]">{price}</p>
      )}
    </article>
  );
}

function SectionHeader({
  title,
  link = "Смотреть все",
}: {
  title: string;
  link?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-[22px] font-semibold leading-tight text-[#25135c]">
        {title}
      </h2>

<Link
  href="/catalog"
  className="shrink-0 text-sm font-medium text-[#7042c5]"
>
  {link} ›
</Link>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] pb-28 shadow-sm">
        <div className="px-5 pt-5">
          <header className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <Image
                src="/audiolad-logo.png"
                alt="Логотип АудиоЛада"
                width={72}
                height={72}
                priority
                className="mt-1 h-[66px] w-[66px] shrink-0 object-contain"
              />

              <div className="min-w-0 pt-1">
                <h1 className="text-[34px] font-semibold leading-none text-[#6234b5]">
                  АудиоЛад
                </h1>

                <p className="mt-3 max-w-[230px] text-[14px] leading-[21px] text-[#6f61a3]">
                  Медитации, энергопрактики и молитвы для любви, изобилия,
                  счастья
                </p>
              </div>
            </div>

            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                aria-label="Поиск"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
              >
                <SearchIcon />
              </button>

              <button
                type="button"
                aria-label="Профиль"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
              >
                <ProfileIcon />
              </button>
            </div>
          </header>

          <section className="mt-6">
            <label className="flex items-center gap-3 rounded-[24px] border border-[#ded1f1] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(109,70,170,0.06)]">
              <span className="text-[#7042c5]">
                <SearchIcon />
              </span>

              <input
                type="search"
                placeholder="Найдите практику, автора или тему"
                className="min-w-0 flex-1 bg-transparent text-[16px] text-[#25135c] outline-none placeholder:text-[#9485b4]"
              />
            </label>
          </section>

          <section className="relative mt-6 overflow-hidden rounded-[28px] bg-gradient-to-br from-[#5f3ba9] via-[#7950c7] to-[#b99ae5] p-6 text-white shadow-[0_16px_40px_rgba(89,50,151,0.22)]">
            <div className="absolute -right-10 -top-8 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-16 right-10 h-40 w-40 rounded-full bg-[#f4c2e4]/20 blur-2xl" />

            <div className="relative">
              <span className="inline-flex rounded-full bg-white/20 px-3 py-1 text-xs">
                Новое
              </span>

              <h2 className="mt-4 max-w-[250px] text-[32px] font-semibold leading-[1.13]">
                Мои личные границы
              </h2>

              <p className="mt-3 max-w-[280px] text-[15px] leading-6 text-white/85">
                Практика для внутренней свободы, уверенности и спокойной защиты
                своего пространства.
              </p>

              <button
                type="button"
                className="mt-6 rounded-2xl border border-white/60 px-6 py-3 font-medium"
              >
                Слушать
              </button>

              <div className="mt-6 flex justify-center gap-2">
                <span className="h-2 w-6 rounded-full bg-white" />
                <span className="h-2 w-2 rounded-full bg-white/40" />
                <span className="h-2 w-2 rounded-full bg-white/40" />
                <span className="h-2 w-2 rounded-full bg-white/40" />
              </div>
            </div>
          </section>

          <section className="mt-8">
            <SectionHeader title="Подборки практик по темам" />

            <div className="-mx-5 mt-4 flex gap-3 overflow-x-auto px-5 pb-2">
              {categories.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  className="min-h-[132px] w-[122px] shrink-0 rounded-[24px] border border-[#eadff8] bg-[#fcfaff] px-4 py-5 text-center shadow-sm"
                >
                  <span className="text-3xl text-[#7042c5]">{item.icon}</span>
                  <span className="mt-3 block text-[14px] leading-5">
                    {item.title}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <SectionHeader title="Популярные практики" />

            <div className="-mx-5 mt-4 flex gap-4 overflow-x-auto px-5 pb-2">
              {popularPractices.map((practice) => (
                <PracticeCard key={practice.title} {...practice} />
              ))}
            </div>
          </section>

          <section className="mt-8">
            <SectionHeader title="Бесплатно для знакомства" />

            <div className="-mx-5 mt-4 flex gap-4 overflow-x-auto px-5 pb-2">
              {freePractices.map((practice) => (
                <PracticeCard
                  key={practice.title}
                  {...practice}
                  free
                />
              ))}
            </div>
          </section>

          <section className="mt-8">
            <SectionHeader title="Новинки" />

            <div className="-mx-5 mt-4 flex gap-4 overflow-x-auto px-5 pb-2">
              {newPractices.map((practice) => (
                <PracticeCard key={practice.title} {...practice} />
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-[26px] border border-[#eadff8] bg-gradient-to-r from-[#faf4ff] to-[#f1e4fc] p-5">
            <p className="text-xl font-semibold text-[#7042c5]">
              Стать автором АудиоЛада
            </p>

            <p className="mt-2 max-w-[280px] text-sm leading-5 text-[#6f61a3]">
              Создавайте медитации, энергопрактики и аудиокурсы, собирайте
              аудиторию и получайте доход.
            </p>

            <button
              type="button"
              className="mt-4 rounded-xl bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white"
            >
              Подробнее
            </button>
          </section>
        </div>

<nav className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[430px] -translate-x-1/2 justify-around border-t border-[#eadff8] bg-white/95 px-1 pb-3 pt-3 shadow-[0_-8px_30px_rgba(86,52,141,0.08)] backdrop-blur">
  <Link
    href="/"
    className="flex min-w-[72px] flex-col items-center gap-1 text-[11px] text-[#7042c5]"
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

  <button
    type="button"
    className="flex min-w-[72px] flex-col items-center gap-1 text-[11px] text-[#81759f]"
  >
    <span className="text-[25px] leading-none">♫</span>
    <span>Плейлисты</span>
  </button>

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