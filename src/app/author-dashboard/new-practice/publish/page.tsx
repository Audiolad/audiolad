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

export default function NewPracticePublishPage() {
  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] pb-10 shadow-sm">
        <div className="px-5 pt-5">
          <header className="flex items-center justify-between">
            <Link
              href="/author-dashboard/new-practice/audio"
              aria-label="Назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <BackIcon />
            </Link>

            <div className="text-center">
              <h1 className="text-[22px] font-semibold">Новая практика</h1>
              <p className="mt-1 text-xs text-[#7d70a2]">Шаг 3 из 3</p>
            </div>

            <div className="h-11 w-11" />
          </header>

          <section className="mt-6">
            <div className="flex gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-[#7042c5]" />
              <div className="h-1.5 flex-1 rounded-full bg-[#7042c5]" />
              <div className="h-1.5 flex-1 rounded-full bg-[#7042c5]" />
            </div>

            <p className="mt-3 text-sm text-[#7d70a2]">
              Цена, доступ и публикация
            </p>
          </section>

          <section className="mt-7 rounded-[26px] border border-[#eadff8] bg-white p-4 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
            <div className="flex gap-4">
              <div className="relative aspect-square w-[108px] shrink-0 overflow-hidden rounded-[20px] bg-gradient-to-br from-[#7652bc] via-[#bd8fd7] to-[#f1c5d3]">
                <div className="absolute inset-0 flex items-center justify-center text-5xl text-white">
                  ◯
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#8c7dab]">
                  Энергопрактика
                </p>

                <h2 className="mt-2 text-[19px] font-semibold leading-6">
                  Мои личные границы
                </h2>

                <p className="mt-2 text-sm text-[#7042c5]">Сергей и Зоя</p>

                <p className="mt-2 text-sm text-[#7d70a2]">
                  17 минут · Для начинающих
                </p>
              </div>
            </div>
          </section>

          <section className="mt-7">
            <h2 className="text-[21px] font-semibold">Тип доступа</h2>

            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-center justify-between rounded-[22px] border-2 border-[#7042c5] bg-[#faf6ff] px-5 py-4">
                <div>
                  <p className="font-semibold">Платная практика</p>
                  <p className="mt-1 text-xs leading-5 text-[#7d70a2]">
                    Пользователь получает постоянный доступ после покупки
                  </p>
                </div>

                <input
                  type="radio"
                  name="access"
                  defaultChecked
                  className="h-5 w-5 accent-[#7042c5]"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-[22px] border border-[#eadff8] bg-white px-5 py-4">
                <div>
                  <p className="font-semibold">Бесплатная практика</p>
                  <p className="mt-1 text-xs leading-5 text-[#7d70a2]">
                    Доступна всем зарегистрированным слушателям
                  </p>
                </div>

                <input
                  type="radio"
                  name="access"
                  className="h-5 w-5 accent-[#7042c5]"
                />
              </label>
            </div>
          </section>

          <section className="mt-7">
            <label className="block">
              <span className="text-sm font-medium">Цена практики</span>

              <div className="relative mt-3">
                <input
                  type="number"
                  defaultValue="199"
                  min="99"
                  step="1"
                  className="w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 pr-14 text-[18px] font-semibold outline-none focus:border-[#7042c5]"
                />

                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[#7d70a2]">
                  ₽
                </span>
              </div>

              <p className="mt-2 text-xs leading-5 text-[#8a7ca9]">
                Рекомендуемая цена для отдельной практики – от 99 до 299 ₽.
              </p>
            </label>
          </section>

          <section className="mt-7">
            <h2 className="text-[21px] font-semibold">Категории</h2>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "Личные границы",
                "Внутренняя опора",
                "Спокойствие",
                "Самоценность",
                "Отношения",
                "Энергия",
              ].map((category, index) => (
                <button
                  key={category}
                  type="button"
                  className={`rounded-full border px-4 py-2 text-sm ${
                    index < 2
                      ? "border-[#7042c5] bg-[#7042c5] text-white"
                      : "border-[#ddcfef] bg-white text-[#7042c5]"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-7 rounded-[22px] border border-[#eadff8] bg-white px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Разрешить скачивание</p>
                <p className="mt-1 text-xs leading-5 text-[#7d70a2]">
                  Слушатель сможет сохранить практику на устройство
                </p>
              </div>

              <button
                type="button"
                aria-label="Разрешить скачивание"
                className="relative h-7 w-12 rounded-full bg-[#7042c5]"
              >
                <span className="absolute right-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm" />
              </button>
            </div>
          </section>

          <section className="mt-4 rounded-[22px] border border-[#eadff8] bg-white px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Публиковать отзывы</p>
                <p className="mt-1 text-xs leading-5 text-[#7d70a2]">
                  Слушатели смогут оставлять оценки и комментарии
                </p>
              </div>

              <button
                type="button"
                aria-label="Публиковать отзывы"
                className="relative h-7 w-12 rounded-full bg-[#7042c5]"
              >
                <span className="absolute right-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm" />
              </button>
            </div>
          </section>

          <section className="mt-7 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] p-5">
            <h2 className="text-lg font-semibold">Перед отправкой</h2>

            <div className="mt-4 space-y-3">
              {[
                "Обложка загружена",
                "Название и описание заполнены",
                "Аудиофайл загружен",
                "Цена и категории указаны",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e8f7ee] text-sm text-[#398b61]">
                    ✓
                  </span>

                  <span className="text-sm text-[#65577f]">{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-7 rounded-[22px] border border-[#f0dfbb] bg-[#fffaf0] p-5">
            <p className="font-semibold text-[#9a6b18]">Модерация</p>

            <p className="mt-2 text-sm leading-6 text-[#7d6b4c]">
              После отправки практика будет проверена перед публикацией. В
              будущем автор получит уведомление о результате проверки.
            </p>
          </section>

          <section className="mt-8 grid grid-cols-2 gap-3">
            <Link
              href="/author-dashboard/new-practice/audio"
              className="flex items-center justify-center rounded-[20px] border border-[#c6afe6] bg-white px-4 py-4 font-semibold text-[#7042c5]"
            >
              Назад
            </Link>

            <Link
              href="/author-dashboard"
              className="flex items-center justify-center rounded-[20px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-4 py-4 text-center font-semibold text-white shadow-[0_12px_28px_rgba(96,59,168,0.22)]"
            >
              Отправить
            </Link>
          </section>

          <p className="mt-4 text-center text-xs leading-5 text-[#8a7ca9]">
            Нажимая кнопку, автор подтверждает, что обладает правами на
            загружаемые материалы.
          </p>
        </div>
      </div>
    </main>
  );
}