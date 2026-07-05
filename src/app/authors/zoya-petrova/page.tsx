import BottomNav from "@/components/BottomNav";
import Image from "next/image";
import Link from "next/link";

const practices = [
  {
    title: "Сила женственности",
    type: "Медитация",
    duration: "16 мин",
    price: "199 ₽",
    symbol: "♡",
    gradient: "from-[#f9d6e9] via-[#e7b9ec] to-[#9d78df]",
  },
  {
    title: "Возвращение к себе",
    type: "Энергопрактика",
    duration: "18 мин",
    price: "Бесплатно",
    symbol: "❀",
    gradient: "from-[#eec8dc] via-[#c69ee0] to-[#8d70c9]",
  },
  {
    title: "Женская самоценность",
    type: "Медитация",
    duration: "21 мин",
    price: "249 ₽",
    symbol: "✦",
    gradient: "from-[#f2ceda] via-[#d3a7dd] to-[#a77bd4]",
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

export default function ZoyaPetrovaPage() {
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

          <section className="mt-6 overflow-hidden rounded-[30px] bg-gradient-to-br from-[#9a65c9] via-[#c78ed6] to-[#efbfd5] p-5 text-white shadow-[0_18px_40px_rgba(96,59,168,0.24)]">
            <div className="flex items-center gap-4">
              <div className="flex h-[110px] w-[110px] shrink-0 items-center justify-center overflow-hidden rounded-[26px] bg-white/15">
                <Image
                  src="/audiolad-logo.png"
                  alt="Зоя Петрова"
                  width={110}
                  height={110}
                  className="h-full w-full object-contain p-4"
                />
              </div>

              <div className="min-w-0">
                <h1 className="text-[27px] font-semibold">Зоя Петрова</h1>

                <p className="mt-2 text-sm leading-5 text-white/75">
                  Женские медитации и практики для самоценности и гармонии
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
                ["11", "практик"],
                ["8,1 тыс.", "слушателей"],
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
            <h2 className="text-[22px] font-semibold">Об авторе</h2>

            <div className="mt-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
              <p className="text-[15px] leading-7 text-[#65577f]">
                Зоя создаёт мягкие женские медитации и энергопрактики для
                принятия себя, внутреннего спокойствия, женственности и
                гармоничных отношений.
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
                  <div
                    className={`relative aspect-square overflow-hidden rounded-[20px] bg-gradient-to-br ${practice.gradient}`}
                  >
                    <span className="absolute left-3 top-3 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-[#7042c5]">
                      {practice.price}
                    </span>

                    <div className="absolute inset-0 flex items-center justify-center text-6xl text-white">
                      {practice.symbol}
                    </div>
                  </div>

                  <h3 className="mt-3 text-[16px] font-semibold leading-5">
                    {practice.title}
                  </h3>

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
                "Женственность",
                "Самоценность",
                "Любовь к себе",
                "Отношения",
                "Спокойствие",
                "Принятие",
              ].map((topic) => (
                <span
                  key={topic}
                  className="rounded-full border border-[#dccdf0] bg-white px-4 py-2 text-sm text-[#7042c5]"
                >
                  {topic}
                </span>
              ))}
            </div>
          </section>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}