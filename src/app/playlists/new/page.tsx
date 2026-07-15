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

export default function NewPlaylistPage() {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface pb-10">
        <div className="px-5 pt-5">
          <header className="flex items-center justify-between">
            <Link
              href="/playlists"
              aria-label="Назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <BackIcon />
            </Link>

            <h1 className="text-[22px] font-semibold">Новый плейлист</h1>

            <div className="h-11 w-11" />
          </header>

          <section className="mt-7">
            <div className="mx-auto flex aspect-square w-full max-w-[260px] items-center justify-center rounded-[32px] border-2 border-dashed border-[#c8afe8] bg-[#faf6ff]">
              <button
                type="button"
                className="flex flex-col items-center text-[#7042c5]"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#7042c5] text-white">
                  <PlusIcon />
                </span>

                <span className="mt-3 text-sm font-medium">
                  Добавить обложку
                </span>
              </button>
            </div>
          </section>

          <section className="mt-7">
            <label className="block">
              <span className="text-sm font-medium">Название плейлиста</span>

              <input
                type="text"
                placeholder="Например, Утро в ресурсе"
                className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]"
              />
            </label>

            <label className="mt-5 block">
              <span className="text-sm font-medium">Описание</span>

              <textarea
                rows={4}
                placeholder="Для какого состояния или цели этот плейлист?"
                className="mt-3 w-full resize-none rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]"
              />
            </label>
          </section>

          <section className="mt-7">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[21px] font-semibold">Практики</h2>
                <p className="mt-1 text-sm text-[#7d70a2]">
                  Пока ничего не добавлено
                </p>
              </div>

              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-[#bda6e1] px-4 py-2 text-sm font-medium text-[#7042c5]"
              >
                <PlusIcon />
                Добавить
              </button>
            </div>

            <div className="mt-4 rounded-[24px] border border-dashed border-[#d4c2eb] bg-[#faf6ff] px-5 py-8 text-center">
              <p className="text-[16px] font-medium">Добавьте первые практики</p>

              <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
                В один плейлист можно собрать медитации и практики разных
                авторов.
              </p>
            </div>
          </section>

          <section className="mt-7">
            <div className="flex items-center justify-between rounded-[22px] border border-[#eadff8] bg-white px-5 py-4">
              <div>
                <p className="font-semibold">Приватный плейлист</p>

                <p className="mt-1 text-xs leading-5 text-[#7d70a2]">
                  Будет доступен только вам
                </p>
              </div>

              <button
                type="button"
                aria-label="Приватный плейлист"
                className="relative h-7 w-12 rounded-full bg-[#ddd2eb]"
              >
                <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm" />
              </button>
            </div>
          </section>

          <section className="mt-8">
            <button
              type="button"
              className="w-full rounded-[22px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-5 py-4 text-[17px] font-semibold text-white shadow-[0_14px_34px_rgba(96,59,168,0.24)]"
            >
              Создать плейлист
            </button>

            <p className="mt-3 text-center text-xs text-[#8a7ca9]">
              Позже плейлист можно будет изменить.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}