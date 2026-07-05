import Link from "next/link";

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

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <path
        d="M20.8 5.8c-2.1-2.1-5.4-2.1-7.5 0L12 7.1l-1.3-1.3c-2.1-2.1-5.4-2.1-7.5 0s-2.1 5.4 0 7.5L12 22l8.8-8.7c2.1-2.1 2.1-5.4 0-7.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

export default function PracticePage() {
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

            <p className="text-sm font-medium text-[#796ba0]">
              Энергопрактика
            </p>

            <button
              type="button"
              aria-label="Добавить в избранное"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <HeartIcon />
            </button>
          </header>

          <section className="mt-6">
            <div className="relative aspect-square overflow-hidden rounded-[32px] bg-gradient-to-br from-[#7652bc] via-[#bd8fd7] to-[#f1c5d3] shadow-[0_22px_48px_rgba(99,61,163,0.22)]">
              <div className="absolute -left-12 -top-10 h-56 w-56 rounded-full bg-white/15 blur-2xl" />
              <div className="absolute -bottom-14 -right-12 h-60 w-60 rounded-full bg-[#f8d8c9]/30 blur-2xl" />

              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-40 w-40 items-center justify-center rounded-full border border-white/45 bg-white/10 text-[90px] text-white shadow-[0_0_50px_rgba(255,255,255,0.32)]">
                  ◯
                </div>
              </div>

              <span className="absolute left-5 top-5 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-[#7042c5]">
                Новинка
              </span>
            </div>
          </section>

          <section className="mt-6">
            <h1 className="text-[32px] font-semibold leading-[1.15]">
              Мои личные границы
            </h1>

            <Link
              href="/authors"
              className="mt-3 inline-block font-medium text-[#7042c5]"
            >
              Сергей и Зоя
            </Link>

            <div className="mt-4 flex flex-wrap gap-2">
              {["17 минут", "Энергопрактика", "Для начинающих"].map((item) => (
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
              Практика помогает почувствовать внутреннюю опору, спокойнее
              воспринимать внешнее давление и бережно возвращать внимание к
              собственным желаниям, чувствам и решениям.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-[18px] bg-[#faf6ff] p-4">
                <p className="text-xs text-[#8a7ca9]">Лучшее время</p>
                <p className="mt-2 text-sm font-medium">После общения</p>
              </div>

              <div className="rounded-[18px] bg-[#faf6ff] p-4">
                <p className="text-xs text-[#8a7ca9]">Рекомендуется</p>
                <p className="mt-2 text-sm font-medium">В наушниках</p>
              </div>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-[22px] font-semibold">
              Что даёт эта практика
            </h2>

            <div className="mt-4 space-y-3">
              {[
                "Возвращение внимания к себе",
                "Спокойное ощущение личного пространства",
                "Укрепление внутренней опоры",
                "Освобождение от лишнего эмоционального давления",
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

          <section className="mt-7 rounded-[26px] bg-gradient-to-r from-[#7042c5] to-[#9974d8] p-5 text-white shadow-[0_14px_34px_rgba(96,59,168,0.24)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white/75">Стоимость практики</p>
                <p className="mt-1 text-[30px] font-semibold">199 ₽</p>
                <p className="mt-1 text-xs text-white/70">
                  Доступ остаётся навсегда
                </p>
              </div>

              <Link
                href="/checkout/personal-boundaries"
                className="rounded-[18px] bg-white px-6 py-4 font-semibold text-[#7042c5]"
              >
                Купить
              </Link>
            </div>
          </section>

          <section className="mt-4">
            <Link
              href="/player/personal-boundaries"
              className="flex w-full items-center justify-center gap-3 rounded-[22px] border border-[#bca6df] bg-white px-5 py-4 font-semibold text-[#7042c5]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7042c5] text-white">
                <PlayIcon />
              </span>
              Открыть плеер
            </Link>

            <p className="mt-3 text-center text-xs leading-5 text-[#8a7ca9]">
              Не слушайте практику во время управления автомобилем.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}