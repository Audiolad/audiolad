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

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
      <path
        d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
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

export default function NewPracticeAudioPage() {
  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] pb-10 shadow-sm">
        <div className="px-5 pt-5">
          <header className="flex items-center justify-between">
            <Link
              href="/author-dashboard/new-practice"
              aria-label="Назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <BackIcon />
            </Link>

            <div className="text-center">
              <h1 className="text-[22px] font-semibold">Новая практика</h1>
              <p className="mt-1 text-xs text-[#7d70a2]">Шаг 2 из 3</p>
            </div>

            <div className="h-11 w-11" />
          </header>

          <section className="mt-6">
            <div className="flex gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-[#7042c5]" />
              <div className="h-1.5 flex-1 rounded-full bg-[#7042c5]" />
              <div className="h-1.5 flex-1 rounded-full bg-[#e6daf4]" />
            </div>

            <p className="mt-3 text-sm text-[#7d70a2]">
              Аудиофайл и рекомендации
            </p>
          </section>

          <section className="mt-7">
            <h2 className="text-[20px] font-semibold">Аудиофайл</h2>

            <div className="mt-4 rounded-[28px] border-2 border-dashed border-[#c8afe8] bg-[#faf6ff] px-6 py-10 text-center">
              <button
                type="button"
                className="mx-auto flex flex-col items-center text-[#7042c5]"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#7042c5] text-white">
                  <UploadIcon />
                </span>

                <span className="mt-4 text-[16px] font-semibold">
                  Загрузить аудиофайл
                </span>

                <span className="mt-2 text-xs leading-5 text-[#8a7ca9]">
                  MP3, WAV или M4A
                  <br />
                  Максимальный размер – 500 МБ
                </span>
              </button>
            </div>
          </section>

          <section className="mt-6 rounded-[24px] border border-[#eadff8] bg-white p-5">
            <div className="flex items-center gap-4">
              <button
                type="button"
                aria-label="Прослушать аудио"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#7042c5] pl-0.5 text-white"
              >
                <PlayIcon />
              </button>

              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">practice-audio.mp3</p>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#eee6f7]">
                  <div className="h-full w-[42%] rounded-full bg-[#7042c5]" />
                </div>

                <div className="mt-2 flex justify-between text-xs text-[#8a7ca9]">
                  <span>00:00</span>
                  <span>17:00</span>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-7 space-y-5">
            <label className="block">
              <span className="text-sm font-medium">
                Продолжительность практики
              </span>

              <input
                type="text"
                placeholder="Например, 17 минут"
                className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">
                Лучшее время для прослушивания
              </span>

              <input
                type="text"
                placeholder="Например, вечером или после общения"
                className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">
                Рекомендации слушателю
              </span>

              <textarea
                rows={5}
                placeholder="Например, устройтесь удобно, наденьте наушники и постарайтесь, чтобы вас никто не отвлекал"
                className="mt-3 w-full resize-none rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]"
              />
            </label>
          </section>

          <section className="mt-7">
            <h2 className="text-[20px] font-semibold">Что даёт практика</h2>

            <div className="mt-4 space-y-3">
              {[
                "Возвращение внимания к себе",
                "Укрепление внутренней опоры",
                "Снижение эмоционального напряжения",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-[18px] border border-[#eadff8] bg-white px-4 py-3"
                >
                  <span className="text-[#7042c5]">✓</span>
                  <span className="text-sm">{item}</span>
                </div>
              ))}

              <button
                type="button"
                className="w-full rounded-[18px] border border-dashed border-[#c8afe8] bg-[#faf6ff] px-4 py-3 text-sm font-medium text-[#7042c5]"
              >
                + Добавить результат
              </button>
            </div>
          </section>

          <section className="mt-8 grid grid-cols-2 gap-3">
            <Link
              href="/author-dashboard/new-practice"
              className="flex items-center justify-center rounded-[20px] border border-[#c6afe6] bg-white px-4 py-4 font-semibold text-[#7042c5]"
            >
              Назад
            </Link>

            <Link
              href="/author-dashboard/new-practice/publish"
              className="flex items-center justify-center rounded-[20px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-4 py-4 font-semibold text-white shadow-[0_12px_28px_rgba(96,59,168,0.22)]"
            >
              Продолжить
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}