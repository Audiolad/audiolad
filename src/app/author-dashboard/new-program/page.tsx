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

export default function NewProgramPage() {
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
              <h1 className="text-[22px] font-semibold">Новая программа</h1>
              <p className="mt-1 text-xs text-[#7d70a2]">Основная информация</p>
            </div>

            <div className="h-11 w-11" />
          </header>

          <section className="mt-7">
            <h2 className="text-[20px] font-semibold">Обложка программы</h2>

            <div className="mx-auto mt-4 flex aspect-square w-full max-w-[280px] items-center justify-center rounded-[30px] border-2 border-dashed border-[#c8afe8] bg-[#faf6ff]">
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
              <span className="text-sm font-medium">Название программы</span>

              <input
                type="text"
                placeholder="Например, 7 дней внутренней опоры"
                className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Формат программы</span>

              <select className="mt-3 w-full appearance-none rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none focus:border-[#7042c5]">
                <option>Программа практик</option>
                <option>Аудиокурс</option>
                <option>Цикл медитаций</option>
                <option>Марафон</option>
                <option>Молитвенный цикл</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium">Описание программы</span>

              <textarea
                rows={5}
                placeholder="Расскажите, кому подходит программа и какой результат она помогает получить"
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

            <label className="block">
              <span className="text-sm font-medium">
                Продолжительность программы
              </span>

              <input
                type="text"
                placeholder="Например, 7 дней"
                className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]"
              />
            </label>
          </section>

          <section className="mt-7">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[21px] font-semibold">Содержание</h2>

                <p className="mt-1 text-sm text-[#7d70a2]">
                  Добавьте практики или уроки
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
              <p className="font-medium">В программе пока нет материалов</p>

              <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
                Можно добавить уже опубликованные практики или загрузить новые
                аудиоуроки.
              </p>
            </div>
          </section>

          <section className="mt-7">
            <h2 className="text-[21px] font-semibold">Стоимость</h2>

            <div className="relative mt-4">
              <input
                type="number"
                defaultValue="1888"
                min="0"
                className="w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 pr-14 text-[18px] font-semibold outline-none focus:border-[#7042c5]"
              />

              <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[#7d70a2]">
                ₽
              </span>
            </div>

            <p className="mt-2 text-xs leading-5 text-[#8a7ca9]">
              Для программ рекомендуемый диапазон – от 888 до 2 888 ₽.
            </p>
          </section>

          <section className="mt-7 rounded-[22px] border border-[#eadff8] bg-[#faf6ff] p-5">
            <p className="font-semibold">Сохранение программы</p>

            <p className="mt-2 text-sm leading-6 text-[#70628e]">
              После создания программа сохранится как черновик. Вы сможете
              добавить материалы, изменить порядок и отправить её на модерацию.
            </p>
          </section>

          <section className="mt-8 grid grid-cols-2 gap-3">
            <Link
              href="/author-dashboard"
              className="flex items-center justify-center rounded-[20px] border border-[#c6afe6] bg-white px-4 py-4 font-semibold text-[#7042c5]"
            >
              Отмена
            </Link>

            <button
              type="button"
              className="rounded-[20px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-4 py-4 font-semibold text-white shadow-[0_12px_28px_rgba(96,59,168,0.22)]"
            >
              Создать черновик
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}