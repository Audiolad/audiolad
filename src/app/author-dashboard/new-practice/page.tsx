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

export default function NewPracticePage() {
  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] pb-10 shadow-sm">
        <div className="px-5 pt-5">
          <header className="flex items-center justify-between">
            <Link
              href="/author-dashboard"
              aria-label="Назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <BackIcon />
            </Link>

            <div className="text-center">
              <h1 className="text-[22px] font-semibold">Новая практика</h1>
              <p className="mt-1 text-xs text-[#7d70a2]">Шаг 1 из 3</p>
            </div>

            <div className="h-11 w-11" />
          </header>

          <section className="mt-6">
            <div className="flex gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-[#7042c5]" />
              <div className="h-1.5 flex-1 rounded-full bg-[#e6daf4]" />
              <div className="h-1.5 flex-1 rounded-full bg-[#e6daf4]" />
            </div>

            <p className="mt-3 text-sm text-[#7d70a2]">
              Основная информация
            </p>
          </section>

          <section className="mt-7">
            <h2 className="text-[20px] font-semibold">Обложка</h2>

            <div className="mt-4 mx-auto flex aspect-square w-full max-w-[280px] items-center justify-center rounded-[30px] border-2 border-dashed border-[#c8afe8] bg-[#faf6ff]">
              <button
                type="button"
                className="flex flex-col items-center text-[#7042c5]"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#7042c5] text-white">
                  <UploadIcon />
                </span>

                <span className="mt-3 font-medium">Загрузить обложку</span>

                <span className="mt-2 text-xs text-[#8a7ca9]">
                  Квадратное изображение 1:1
                </span>
              </button>
            </div>
          </section>

          <section className="mt-7 space-y-5">
            <label className="block">
              <span className="text-sm font-medium">Название практики</span>

              <input
                type="text"
                placeholder="Например, Мои личные границы"
                className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Формат</span>

              <select className="mt-3 w-full appearance-none rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none focus:border-[#7042c5]">
                <option>Медитация</option>
                <option>Энергопрактика</option>
                <option>Молитва</option>
                <option>Аффирмации</option>
                <option>Аудиоурок</option>
                <option>Энергопоток</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium">Краткое описание</span>

              <textarea
                rows={4}
                placeholder="Расскажите, для какого состояния или запроса создана практика"
                className="mt-3 w-full resize-none rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Автор</span>

              <select className="mt-3 w-full appearance-none rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none focus:border-[#7042c5]">
                <option>Сергей и Зоя</option>
                <option>Зоя Петрова</option>
                <option>Сергей Петров</option>
              </select>
            </label>

            <div>
              <p className="text-sm font-medium">Уровень подготовки</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {["Для начинающих", "Средний уровень", "Для опытных"].map(
                  (level, index) => (
                    <button
                      key={level}
                      type="button"
                      className={`rounded-full border px-4 py-2 text-sm ${
                        index === 0
                          ? "border-[#7042c5] bg-[#7042c5] text-white"
                          : "border-[#ddcfef] bg-white text-[#7042c5]"
                      }`}
                    >
                      {level}
                    </button>
                  ),
                )}
              </div>
            </div>
          </section>

          <section className="mt-7 rounded-[22px] border border-[#eadff8] bg-[#faf6ff] p-5">
            <p className="font-semibold">Что будет дальше</p>

            <p className="mt-2 text-sm leading-6 text-[#70628e]">
              На следующем шаге вы загрузите аудиофайл, укажете длительность и
              добавите рекомендации для слушателей.
            </p>
          </section>

          <section className="mt-7 grid grid-cols-2 gap-3">
            <Link
              href="/author-dashboard"
              className="flex items-center justify-center rounded-[20px] border border-[#c6afe6] bg-white px-4 py-4 font-semibold text-[#7042c5]"
            >
              Отмена
            </Link>

<Link
  href="/author-dashboard/new-practice/audio"
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