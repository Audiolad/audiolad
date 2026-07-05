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

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.2-1.8h4.6L15.5 6h2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12.5"
        r="3"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export default function EditProfilePage() {
  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] pb-10 shadow-sm">
        <div className="px-5 pt-5">
          <header className="flex items-center justify-between">
            <Link
              href="/profile"
              aria-label="Назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <BackIcon />
            </Link>

            <div className="text-center">
              <h1 className="text-[24px] font-semibold">
                Редактировать профиль
              </h1>
              <p className="mt-1 text-xs text-[#7d70a2]">
                Личные данные слушателя
              </p>
            </div>

            <div className="h-11 w-11" />
          </header>

          <section className="mt-7">
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="flex h-[130px] w-[130px] items-center justify-center overflow-hidden rounded-[34px] bg-gradient-to-br from-[#eadcf7] to-[#c4a4e5] text-[46px] font-semibold text-[#7042c5] shadow-[0_14px_34px_rgba(96,59,168,0.14)]">
                  С
                </div>

                <button
                  type="button"
                  aria-label="Изменить фотографию"
                  className="absolute -bottom-2 -right-2 flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-[#7042c5] text-white shadow-lg"
                >
                  <CameraIcon />
                </button>
              </div>

              <p className="mt-5 text-sm font-medium text-[#7042c5]">
                Изменить фотографию
              </p>

              <p className="mt-2 text-center text-xs leading-5 text-[#8a7ca9]">
                JPG или PNG, квадратное изображение
              </p>
            </div>
          </section>

          <section className="mt-8 space-y-5">
            <label className="block">
              <span className="text-sm font-medium">Имя</span>

              <input
                type="text"
                defaultValue="Сергей"
                className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none focus:border-[#7042c5]"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Фамилия</span>

              <input
                type="text"
                defaultValue="Петров"
                className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none focus:border-[#7042c5]"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Электронная почта</span>

              <input
                type="email"
                defaultValue="sergey@example.com"
                className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none focus:border-[#7042c5]"
              />

              <p className="mt-2 text-xs leading-5 text-[#8a7ca9]">
                На этот адрес будут приходить чеки и уведомления о покупках.
              </p>
            </label>

            <label className="block">
              <span className="text-sm font-medium">Телефон</span>

              <input
                type="tel"
                placeholder="+7 999 000-00-00"
                className="mt-3 w-full rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">О себе</span>

              <textarea
                rows={4}
                placeholder="Несколько слов о себе"
                className="mt-3 w-full resize-none rounded-[20px] border border-[#ddcfef] bg-white px-4 py-4 outline-none placeholder:text-[#a99db9] focus:border-[#7042c5]"
              />
            </label>
          </section>

          <section className="mt-7">
            <h2 className="text-[20px] font-semibold">Интересы</h2>

            <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
              Они помогут АудиоЛаду подбирать подходящие материалы.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "Спокойствие",
                "Любовь",
                "Изобилие",
                "Женственность",
                "Личные границы",
                "Энергия",
                "Сон",
                "Молитвы",
              ].map((interest, index) => (
                <button
                  key={interest}
                  type="button"
                  className={`rounded-full border px-4 py-2 text-sm ${
                    index < 3
                      ? "border-[#7042c5] bg-[#7042c5] text-white"
                      : "border-[#ddcfef] bg-white text-[#7042c5]"
                  }`}
                >
                  {interest}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-7 rounded-[22px] border border-[#eadff8] bg-[#faf6ff] p-5">
            <p className="font-semibold">Публичность профиля</p>

            <div className="mt-4 flex items-center justify-between">
              <div className="pr-4">
                <p className="text-sm font-medium">Показывать имя авторам</p>
                <p className="mt-1 text-xs leading-5 text-[#7d70a2]">
                  Имя будет видно рядом с отзывами и комментариями.
                </p>
              </div>

              <button
                type="button"
                aria-label="Показывать имя авторам"
                className="relative h-7 w-12 shrink-0 rounded-full bg-[#7042c5]"
              >
                <span className="absolute right-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm" />
              </button>
            </div>
          </section>

          <section className="mt-8 grid grid-cols-2 gap-3">
            <Link
              href="/profile"
              className="flex items-center justify-center rounded-[20px] border border-[#c6afe6] bg-white px-4 py-4 font-semibold text-[#7042c5]"
            >
              Отмена
            </Link>

            <Link
              href="/profile"
              className="flex items-center justify-center rounded-[20px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-4 py-4 font-semibold text-white shadow-[0_12px_28px_rgba(96,59,168,0.22)]"
            >
              Сохранить
            </Link>
          </section>

          <p className="mt-4 text-center text-xs leading-5 text-[#8a7ca9]">
            Пока изменения не сохраняются в базе данных. Мы подключим это
            позднее.
          </p>
        </div>
      </div>
    </main>
  );
}