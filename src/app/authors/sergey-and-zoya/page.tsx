import Image from "next/image"; import BottomNav from "@/components/BottomNav";
import Link from "next/link";

const practices = [
  {
    title: "Мои личные границы",
    type: "Энергопрактика",
    duration: "17 мин",
    price: "199 ₽",
    symbol: "◯",
    gradient: "from-[#7652bc] via-[#bd8fd7] to-[#f1c5d3]",
    href: "/practice/personal-boundaries",
  },
  {
    title: "Ключ к изобилию",
    type: "Медитация",
    duration: "21 мин",
    price: "Бесплатно",
    symbol: "✦",
    gradient: "from-[#e6b35b] via-[#f4dba4] to-[#b986da]",
    href: "#",
  },
  {
    title: "Эликсир молодости",
    type: "Энергопрактика",
    duration: "18 мин",
    price: "Бесплатно",
    symbol: "❀",
    gradient: "from-[#a274dc] via-[#e1b4ed] to-[#f6d8ec]",
    href: "#",
  },
  {
    title: "Любовь и доверие",
    type: "Медитация",
    duration: "16 мин",
    price: "249 ₽",
    symbol: "♡",
    gradient: "from-[#f0bcd1] via-[#c497dc] to-[#8564c8]",
    href: "#",
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

export default function SergeyAndZoyaPage() {
  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] pb-28 shadow-sm">
        <div className="px-5 pt-5">
          <header className="flex items-center justify-between">
            <Link
              href="/authors"
              aria-label="Назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <BackIcon />
            </Link>

            <p className="text-sm font-medium text-[#7d70a2]">
              Страница автора
            </p>

            <button
              type="button"
              aria-label="Поделиться"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-xl text-[#7042c5]"
            >
              ↗
            </button>
          </header>

          <section className="mt-6 overflow-hidden rounded-[30px] bg-gradient-to-br from-[#7042c5] to-[#a27bd9] p-5 text-white shadow-[0_18px_40px_rgba(96,59,168,0.24)]">
            <div className="flex items-center gap-4">
              <div className="flex h-[110px] w-[110px] shrink-0 items-center justify-center overflow-hidden rounded-[26px] bg-white/15">
                <Image
                  src="/audiolad-logo.png"
                  alt="Сергей и Зоя"
                  width={110}
                  height={110}
                  className="h-full w-full object-contain p-4"
                />
              </div>

              <div className="min-w-0">
                <h1 className="text-[27px] font-semibold">Сергей и Зоя</h1>

                <p className="mt-2 text-sm leading-5 text-white/75">
                  Медитации, энергопрактики и программы для внутренней гармонии
                </p>

                <button
                  type="button"
                  className="mt-4 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#7042c5]"
                >
                  Подписаться
                </button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                ["18", "практик"],
                ["12,4 тыс.", "слушателей"],
                ["4,9", "рейтинг"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-[18px] bg-white/10 px-2 py-3 text-center"
                >
                  <p className="text-lg font-semibold">{value}</p>
                  <p className="mt-1 text-[10px] text-white/65">{label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <h2 className="text-[22px] font-semibold">Об авторах</h2>

            <div className="mt-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
              <p className="text-[15px] leading-7 text-[#65577f]">
                Сергей и Зоя создают совместные медитации, энергопрактики и
                программы для любви, внутренней опоры, отношений, изобилия и
                гармонии.
              </p>

              <p className="mt-4 text-[15px] leading-7 text-[#65577f]">
                В практиках соединяются спокойная голосовая подача, музыка и
                последовательная работа с вниманием, состоянием и внутренним
                ресурсом.
              </p>
            </div>
          </section>

          <section className="mt-7">
            <div className="flex items-center justify-between">
              <h2 className="text-[22px] font-semibold">Популярные практики</h2>

              <button
                type="button"
                className="text-sm font-medium text-[#7042c5]"
              >
                Все практики ›
              </button>
            </div>

            <div className="-mx-5 mt-4 flex gap-4 overflow-x-auto px-5 pb-2">
              {practices.map((practice) => (
                <article
                  key={practice.title}
                  className="w-[188px] shrink-0 rounded-[24px] border border-[#eadff8] bg-white p-3 shadow-sm"
                >
                  <Link
                    href={practice.href}
                    className={`relative block aspect-square overflow-hidden rounded-[20px] bg-gradient-to-br ${practice.gradient}`}
                  >
                    <span className="absolute left-3 top-3 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-[#7042c5]">
                      {practice.price}
                    </span>

                    <div className="absolute inset-0 flex items-center justify-center text-6xl text-white">
                      {practice.symbol}
                    </div>
                  </Link>

                  <Link
                    href={practice.href}
                    className="mt-3 block text-[16px] font-semibold leading-5"
                  >
                    {practice.title}
                  </Link>

                  <p className="mt-2 text-xs text-[#7d70a2]">
                    {practice.type} · {practice.duration}
                  </p>

                  <button
                    type="button"
                    className="mt-3 flex items-center gap-2 text-sm font-medium text-[#7042c5]"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#7042c5] text-white">
                      <PlayIcon />
                    </span>
                    Слушать
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <h2 className="text-[22px] font-semibold">Темы практик</h2>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "Любовь",
                "Отношения",
                "Изобилие",
                "Личные границы",
                "Энергия",
                "Самоценность",
                "Внутренняя опора",
              ].map((topic) => (
                <button
                  key={topic}
                  type="button"
                  className="rounded-full border border-[#dccdf0] bg-white px-4 py-2 text-sm text-[#7042c5]"
                >
                  {topic}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <h2 className="text-[22px] font-semibold">Отзывы слушателей</h2>

            <div className="mt-4 space-y-3">
              {[
                {
                  name: "Анна",
                  text: "Очень тёплая подача. После практики стало спокойнее и легче.",
                },
                {
                  name: "Марина",
                  text: "Возвращаюсь к этим медитациям несколько раз в неделю.",
                },
              ].map((review) => (
                <article
                  key={review.name}
                  className="rounded-[22px] border border-[#eadff8] bg-white p-5"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{review.name}</p>
                    <p className="text-sm text-[#e4a536]">★★★★★</p>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-[#65577f]">
                    {review.text}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>

<BottomNav />
      </div>
    </main>
  );
}