import Image from "next/image";import BottomNav from "@/components/BottomNav";
import Link from "next/link";

const favoriteAuthors = [
  {
    name: "Сергей и Зоя",
    description: "Совместные медитации и программы",
    image: "/audiolad-logo.png",
    href: "/authors/sergey-and-zoya",
  },
  {
    name: "Зоя Петрова",
    description: "Женские практики и медитации",
    image: "/audiolad-logo.png",
    href: "/authors/zoya-petrova",
  },
  {
    name: "Сергей Петров",
    description: "Энергопотоки и внутренняя сила",
    image: "/audiolad-logo.png",
    href: "/authors/sergey-petrov",
  },
];

const settings = [
  ["Уведомления", "◌"],
  ["Способы оплаты", "▭"],
  ["Помощь", "?"],
  ["О приложении", "i"],
];

export default function ProfilePage() {
  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] pb-28 shadow-sm">
        <div className="px-5 pt-6">
          <header className="flex items-center justify-between">
            <Image
              src="/audiolad-logo.png"
              alt="АудиоЛад"
              width={48}
              height={48}
              className="h-12 w-12 object-contain"
            />

            <h1 className="text-[28px] font-semibold">Профиль</h1>

            <button
              type="button"
              aria-label="Настройки"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-2xl text-[#7042c5]"
            >
              ⚙
            </button>
          </header>

          <section className="relative mt-6 overflow-hidden rounded-[28px] border border-[#eadff8] bg-gradient-to-br from-[#fffaff] to-[#f2e6fb] p-5 shadow-[0_12px_30px_rgba(90,60,145,0.08)]">
            <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[#d8b8f2]/25 blur-2xl" />

            <div className="relative flex items-center gap-4">
              <div className="flex h-[92px] w-[92px] shrink-0 items-center justify-center overflow-hidden rounded-[24px] border-2 border-white bg-[#f7effe] shadow-sm">
                <span className="text-4xl text-[#7042c5]">С</span>
              </div>

              <div className="min-w-0">
                <h2 className="text-[25px] font-semibold">Сергей</h2>

                <p className="mt-1 text-sm text-[#796ba0]">
                  Ваш путь в АудиоЛаде
                </p>

                <button
                  type="button"
                  className="mt-3 rounded-full border border-[#bda6e1] px-4 py-2 text-sm font-medium text-[#7042c5]"
                >
                  Редактировать профиль
                </button>
              </div>
            </div>

            <div className="relative mt-5 grid grid-cols-3 gap-3">
              {[
                ["24", "практики"],
                ["5", "плейлистов"],
                ["3", "автора"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-[18px] border border-white/80 bg-white/65 px-2 py-3 text-center"
                >
                  <p className="text-xl font-semibold text-[#7042c5]">
                    {value}
                  </p>
                  <p className="mt-1 text-xs text-[#796ba0]">{label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 grid grid-cols-4 gap-2">
            {[
              ["▢", "Мои покупки"],
              ["♡", "Избранное"],
              ["⇩", "Скачанные"],
              ["◷", "История"],
            ].map(([icon, title]) => (
              <button
                key={title}
                type="button"
                className="flex min-h-[94px] flex-col items-center justify-center rounded-[22px] border border-[#eadff8] bg-white px-2 text-center shadow-sm"
              >
                <span className="text-2xl text-[#7042c5]">{icon}</span>
                <span className="mt-2 text-[11px] leading-4">{title}</span>
              </button>
            ))}
          </section>

          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-[21px] font-semibold">Любимые авторы</h2>

              <button
                type="button"
                className="text-sm font-medium text-[#7042c5]"
              >
                Смотреть все ›
              </button>
            </div>

            <div className="-mx-5 mt-4 flex gap-3 overflow-x-auto px-5 pb-2">
              {favoriteAuthors.map((author) => (
                <article
                  key={author.name}
                  className="w-[154px] shrink-0 rounded-[22px] border border-[#eadff8] bg-white p-3 shadow-sm"
                >
<Link
  href={author.href}
  className="block aspect-square overflow-hidden rounded-[18px] bg-[#f7effe]"
>
  <Image
    src={author.image}
    alt={author.name}
    width={160}
    height={160}
    className="h-full w-full object-contain p-4"
  />
</Link>

<Link
  href={author.href}
  className="mt-3 block text-[15px] font-semibold"
>
  {author.name}
</Link>

                  <p className="mt-1 line-clamp-2 min-h-[40px] text-xs leading-5 text-[#796ba0]">
                    {author.description}
                  </p>

                  <button
                    type="button"
                    aria-label="Убрать из любимых"
                    className="mt-2 text-xl text-[#7042c5]"
                  >
                    ♥
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-[21px] font-semibold">Для авторов</h2>

            <Link
              href="/author-dashboard"
              className="mt-4 flex items-center justify-between rounded-[24px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] p-5 text-white shadow-[0_12px_30px_rgba(96,59,168,0.22)]"
            >
              <div>
                <p className="text-lg font-semibold">Кабинет автора</p>
                <p className="mt-1 max-w-[250px] text-sm leading-5 text-white/80">
                  Практики, продажи, статистика и выплаты
                </p>
              </div>

              <span className="text-3xl">›</span>
            </Link>

            <button
              type="button"
              className="mt-3 flex w-full items-center justify-between rounded-[22px] border border-[#eadff8] bg-white px-5 py-4 text-left"
            >
              <div>
                <p className="font-semibold">Стать автором</p>
                <p className="mt-1 text-sm text-[#796ba0]">
                  Размещайте свои аудиопрактики
                </p>
              </div>

              <span className="text-2xl text-[#7042c5]">›</span>
            </button>
          </section>

          <section className="mt-8">
            <h2 className="text-[21px] font-semibold">Настройки</h2>

            <div className="mt-4 overflow-hidden rounded-[22px] border border-[#eadff8] bg-white">
              {settings.map(([title, icon], index) => (
                <button
                  key={title}
                  type="button"
                  className={`flex w-full items-center justify-between px-5 py-4 ${
                    index !== settings.length - 1
                      ? "border-b border-[#eee6f7]"
                      : ""
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f4ecfb] text-[#7042c5]">
                      {icon}
                    </span>

                    <span>{title}</span>
                  </span>

                  <span className="text-xl text-[#7042c5]">›</span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] p-5">
            <h2 className="text-lg font-semibold text-[#7042c5]">
              Пригласите друга
            </h2>

            <p className="mt-2 text-sm leading-5 text-[#796ba0]">
              Поделитесь АудиоЛадом и подарите другу 7 дней премиум-доступа.
            </p>

            <button
              type="button"
              className="mt-4 rounded-xl bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white"
            >
              Пригласить
            </button>
          </section>
        </div>

<BottomNav />
      </div>
    </main>
  );
}