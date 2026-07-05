import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#fbf8ff] text-[#25135c]">
      <div className="mx-auto min-h-screen max-w-[430px] bg-white px-5 pb-28 pt-6 shadow-sm">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/audiolad-logo.png"
              alt="Логотип АудиоЛада"
              width={68}
              height={68}
              priority
              className="h-[68px] w-[68px] rounded-2xl object-contain"
            />

            <div>
              <h1 className="text-3xl font-semibold leading-none text-[#6337b7]">
                АудиоЛад
              </h1>

              <p className="mt-3 max-w-[250px] text-sm leading-5 text-[#6f61a3]">
                Медитации, энергопрактики и молитвы для любви, изобилия, счастья
              </p>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              aria-label="Поиск"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e7dcf6] text-2xl text-[#6337b7]"
            >
              ⌕
            </button>

            <button
              type="button"
              aria-label="Профиль"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e7dcf6] text-xl text-[#6337b7]"
            >
              ♙
            </button>
          </div>
        </header>

        <section className="mt-7">
          <label className="flex items-center gap-3 rounded-3xl border border-[#ded1f1] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(109,70,170,0.08)]">
            <span className="text-2xl text-[#7042c5]">⌕</span>

            <input
              type="search"
              placeholder="Найдите практику, автора или тему"
              className="w-full bg-transparent text-base text-[#25135c] outline-none placeholder:text-[#8c7dad]"
            />
          </label>
        </section>

        <section className="mt-7 overflow-hidden rounded-[28px] bg-gradient-to-br from-[#6940ba] via-[#7b54cc] to-[#c09ee8] p-6 text-white shadow-[0_16px_40px_rgba(89,50,151,0.22)]">
          <span className="inline-flex rounded-full bg-white/20 px-3 py-1 text-xs">
            Новое
          </span>

          <h2 className="mt-4 max-w-[240px] text-3xl font-semibold leading-tight">
            Мои личные границы
          </h2>

          <p className="mt-3 max-w-[270px] text-sm leading-6 text-white/85">
            Практика для внутренней свободы, уверенности и спокойной защиты
            своего пространства.
          </p>

          <button
            type="button"
            className="mt-6 rounded-2xl border border-white/60 px-5 py-3 font-medium"
          >
            Слушать
          </button>

          <div className="mt-5 flex justify-center gap-2">
            <span className="h-2 w-6 rounded-full bg-white" />
            <span className="h-2 w-2 rounded-full bg-white/40" />
            <span className="h-2 w-2 rounded-full bg-white/40" />
            <span className="h-2 w-2 rounded-full bg-white/40" />
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Подборки практик по темам</h2>

            <button
              type="button"
              className="text-sm font-medium text-[#7042c5]"
            >
              Смотреть все ›
            </button>
          </div>

          <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
            {[
              ["♡", "Любовь и отношения"],
              ["₽", "Деньги и изобилие"],
              ["☾", "Спокойствие и сон"],
              ["♧", "Энергия и здоровье"],
            ].map(([icon, title]) => (
              <button
                key={title}
                type="button"
                className="min-w-[120px] rounded-3xl border border-[#eadff8] bg-[#fcfaff] px-4 py-5 text-center shadow-sm"
              >
                <span className="text-3xl text-[#7042c5]">{icon}</span>
                <span className="mt-3 block text-sm leading-5">{title}</span>
              </button>
            ))}
          </div>
        </section>

        <nav className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[430px] -translate-x-1/2 justify-around border-t border-[#eadff8] bg-white px-2 pb-3 pt-3 shadow-[0_-8px_30px_rgba(86,52,141,0.08)]">
          {[
            ["⌂", "Главная"],
            ["▦", "Каталог"],
            ["▥", "Мои практики"],
            ["♫", "Плейлисты"],
            ["◎", "Профиль"],
          ].map(([icon, title], index) => (
            <button
              key={title}
              type="button"
              className={`flex min-w-[68px] flex-col items-center gap-1 text-xs ${
                index === 0 ? "text-[#7042c5]" : "text-[#81759f]"
              }`}
            >
              <span className="text-2xl">{icon}</span>
              <span>{title}</span>
            </button>
          ))}
        </nav>
      </div>
    </main>
  );
}