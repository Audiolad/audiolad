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

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-10 w-10" fill="currentColor">
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

function RewindIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
      <path
        d="M11 7 5 12l6 5V7ZM19 7l-6 5 6 5V7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
      <path
        d="m13 7 6 5-6 5V7ZM5 7l6 5-6 5V7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PlayerPage() {
  return (
    <main className="min-h-screen bg-[#24133f] text-white">
      <div className="relative mx-auto min-h-screen w-full max-w-[430px] overflow-hidden bg-gradient-to-b from-[#6f4bbb] via-[#8e68c9] to-[#2b1749] px-5 pb-8 pt-5">
        <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-[#e5b5df]/20 blur-3xl" />
        <div className="absolute -right-24 bottom-20 h-72 w-72 rounded-full bg-[#e9c3b5]/15 blur-3xl" />

        <header className="relative z-10 flex items-center justify-between">
          <Link
            href="/practice/personal-boundaries"
            aria-label="Назад"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 backdrop-blur"
          >
            <BackIcon />
          </Link>

          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-white/60">
              Сейчас играет
            </p>
            <p className="mt-1 text-sm font-medium">Энергопрактика</p>
          </div>

          <button
            type="button"
            aria-label="Дополнительное меню"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 backdrop-blur"
          >
            <MoreIcon />
          </button>
        </header>

        <section className="relative z-10 mt-8">
          <div className="relative aspect-square overflow-hidden rounded-[34px] bg-gradient-to-br from-[#7652bc] via-[#bd8fd7] to-[#f1c5d3] shadow-[0_28px_70px_rgba(20,8,42,0.38)]">
            <div className="absolute -left-10 -top-10 h-52 w-52 rounded-full bg-white/15 blur-2xl" />
            <div className="absolute -bottom-12 -right-10 h-56 w-56 rounded-full bg-[#f7d2c8]/30 blur-2xl" />

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-44 w-44 items-center justify-center rounded-full border border-white/40 bg-white/10 text-[100px] text-white shadow-[0_0_60px_rgba(255,255,255,0.28)]">
                ◯
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 mt-7 text-center">
          <h1 className="text-[29px] font-semibold leading-tight">
            Мои личные границы
          </h1>

          <Link
            href="/authors"
            className="mt-2 inline-block text-sm font-medium text-white/70"
          >
            Сергей и Зоя
          </Link>
        </section>

        <section className="relative z-10 mt-8">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full w-[38%] rounded-full bg-white" />
          </div>

          <div className="mt-2 flex justify-between text-xs text-white/60">
            <span>06:24</span>
            <span>17:00</span>
          </div>
        </section>

        <section className="relative z-10 mt-7 flex items-center justify-center gap-8">
          <button
            type="button"
            aria-label="Назад на 15 секунд"
            className="relative flex h-12 w-12 items-center justify-center text-white/90"
          >
            <RewindIcon />
            <span className="absolute text-[9px] font-semibold">15</span>
          </button>

          <button
            type="button"
            aria-label="Воспроизвести"
            className="flex h-[78px] w-[78px] items-center justify-center rounded-full bg-white pl-1 text-[#7042c5] shadow-[0_14px_35px_rgba(20,8,42,0.35)]"
          >
            <PlayIcon />
          </button>

          <button
            type="button"
            aria-label="Вперёд на 15 секунд"
            className="relative flex h-12 w-12 items-center justify-center text-white/90"
          >
            <ForwardIcon />
            <span className="absolute text-[9px] font-semibold">15</span>
          </button>
        </section>

        <section className="relative z-10 mt-8 grid grid-cols-3 gap-3">
          <button
            type="button"
            className="rounded-[18px] bg-white/10 px-3 py-4 text-center backdrop-blur"
          >
            <span className="block text-xl">♡</span>
            <span className="mt-2 block text-xs text-white/70">Избранное</span>
          </button>

          <button
            type="button"
            className="rounded-[18px] bg-white/10 px-3 py-4 text-center backdrop-blur"
          >
            <span className="block text-xl">☾</span>
            <span className="mt-2 block text-xs text-white/70">Таймер сна</span>
          </button>

          <button
            type="button"
            className="rounded-[18px] bg-white/10 px-3 py-4 text-center backdrop-blur"
          >
            <span className="block text-xl">☷</span>
            <span className="mt-2 block text-xs text-white/70">Очередь</span>
          </button>
        </section>

        <section className="relative z-10 mt-6 rounded-[24px] bg-white/10 p-5 backdrop-blur">
          <p className="text-sm font-semibold">Рекомендация</p>
          <p className="mt-2 text-sm leading-6 text-white/70">
            Устройтесь удобно, наденьте наушники и постарайтесь, чтобы в течение
            практики вас никто не отвлекал.
          </p>
        </section>
      </div>
    </main>
  );
}