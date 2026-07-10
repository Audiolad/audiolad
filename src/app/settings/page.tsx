import BottomNav from "@/components/BottomNav";
import { signOut } from "@/app/auth/sign-out/actions";
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

const sections = [
  {
    title: "Аккаунт",
    items: [
      {
        icon: "◎",
        title: "Личные данные",
        description: "Имя, фотография и контактная информация",
      },
      {
        icon: "✉",
        title: "Электронная почта",
        description: "sergey@example.com",
      },
      {
        icon: "⌘",
        title: "Пароль и безопасность",
        description: "Изменение пароля и защита аккаунта",
      },
    ],
  },
  {
    title: "Прослушивание",
    items: [
      {
        icon: "♫",
        title: "Качество аудио",
        description: "Высокое",
      },
      {
        icon: "⇩",
        title: "Настройки скачивания",
        description: "Только через Wi-Fi",
      },
      {
        icon: "▶",
        title: "Автовоспроизведение",
        description: "Продолжать следующую практику",
      },
    ],
  },
  {
    title: "Уведомления",
    items: [
      {
        icon: "◌",
        title: "Новые практики авторов",
        description: "Получать уведомления о новых материалах",
      },
      {
        icon: "♡",
        title: "Рекомендации",
        description: "Персональные подборки и предложения",
      },
      {
        icon: "₽",
        title: "Покупки и платежи",
        description: "Чеки, статусы и подтверждения оплаты",
      },
    ],
  },
  {
    title: "Приложение",
    items: [
      {
        icon: "☼",
        title: "Оформление",
        description: "Светлая тема",
      },
      {
        icon: "Я",
        title: "Язык",
        description: "Русский",
      },
      {
        icon: "?",
        title: "Помощь и поддержка",
        description: "Ответы на вопросы и связь с нами",
      },
    ],
  },
];

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] pb-28 shadow-sm">
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
              <h1 className="text-[26px] font-semibold">Настройки</h1>
              <p className="mt-1 text-xs text-[#7d70a2]">
                Управление аккаунтом и приложением
              </p>
            </div>

            <div className="h-11 w-11" />
          </header>

          <section className="mt-7 rounded-[26px] bg-gradient-to-br from-[#7042c5] to-[#9a74d8] p-5 text-white shadow-[0_14px_34px_rgba(96,59,168,0.22)]">
            <p className="text-sm text-white/70">Ваш аккаунт</p>

            <div className="mt-3 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/15 text-2xl font-semibold">
                С
              </div>

              <div>
                <p className="text-xl font-semibold">Сергей</p>
                <p className="mt-1 text-sm text-white/70">
                  Слушатель и автор АудиоЛада
                </p>
              </div>
            </div>
          </section>

          {sections.map((section) => (
            <section key={section.title} className="mt-8">
              <h2 className="text-[20px] font-semibold">{section.title}</h2>

              <div className="mt-4 overflow-hidden rounded-[22px] border border-[#eadff8] bg-white">
                {section.items.map((item, index) => (
                  <button
                    key={item.title}
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 px-5 py-4 text-left ${
                      index !== section.items.length - 1
                        ? "border-b border-[#eee6f7]"
                        : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f4ecfb] text-[#7042c5]">
                        {item.icon}
                      </span>

                      <span className="min-w-0">
                        <span className="block font-medium">{item.title}</span>

                        <span className="mt-1 block text-xs leading-5 text-[#7d70a2]">
                          {item.description}
                        </span>
                      </span>
                    </span>

                    <span className="shrink-0 text-xl text-[#7042c5]">›</span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          <section className="mt-8">
            <form action={signOut}>
              <button
                type="submit"
                className="w-full rounded-[20px] border border-[#efc7cf] bg-[#fff8f9] px-5 py-4 font-semibold text-[#b34f63]"
              >
                Выйти из аккаунта
              </button>
            </form>

            <button
              type="button"
              className="mt-3 w-full px-5 py-3 text-sm text-[#a692b4]"
            >
              Удалить аккаунт
            </button>
          </section>

          <p className="mt-6 text-center text-xs text-[#a692b4]">
            АудиоЛад · Версия 1.0
          </p>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}