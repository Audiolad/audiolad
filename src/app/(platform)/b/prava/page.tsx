import type { Metadata } from "next";
import Link from "next/link";

import AudioladHorizontalLogo from "@/components/brand/AudioladHorizontalLogo";
import LegalLinksNav from "@/components/legal/LegalLinksNav";

export const metadata: Metadata = {
  title: "Как устроены права на музыку — АудиоЛад Бизнес",
  description:
    "Простое объяснение правовой модели сервиса «АудиоЛад Бизнес» для кафе, ресторанов, SPA, салонов, отелей, магазинов и других коммерческих пространств.",
  alternates: { canonical: "/b/prava" },
};

const cardClass =
  "rounded-[24px] border border-[#eadff8] bg-white p-6 shadow-[0_12px_35px_rgba(74,42,130,0.06)]";
const bodyClass = "text-[18px] leading-8 text-[#4c3d78]";

export default function BusinessRightsPage() {
  return (
    <main className="min-h-screen bg-[#fbf9ff] text-[#25135c]">
      <div className="mx-auto w-full max-w-[980px] px-5 py-8 lg:px-10 lg:py-12">
        <header className="flex items-center justify-between gap-4">
          <AudioladHorizontalLogo priority />
          <Link
            href="/b"
            className="text-sm font-medium text-[#7042c5] underline-offset-2 hover:underline"
          >
            ← «АудиоЛад Бизнес»
          </Link>
        </header>

        <section className="mt-10 rounded-[30px] bg-[#f4e9ff] p-7 lg:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#7042c5]">
            Для бизнес-клиентов
          </p>
          <h1 className="mt-3 text-[34px] font-semibold leading-tight lg:text-[48px]">
            Как «АудиоЛад Бизнес» работает с правами на музыку
          </h1>
          <p className="mt-5 text-[20px] leading-8 text-[#4c3d78] lg:text-[22px]">
            Одна и та же музыка может быть открыто доступна слушателям и
            одновременно легально использоваться в кафе, ресторане, SPA,
            салоне, отеле или магазине — если для этого оформлен отдельный
            договорный контур.
          </p>
        </section>

        <div className="mt-8 grid gap-6">
          <section className={cardClass}>
            <h2 className="text-[28px] font-semibold">Почему обычной подписки недостаточно</h2>
            <p className={"mt-4 " + bodyClass}>
              Домашнее прослушивание и публичное звучание музыки перед гостями
              коммерческого пространства — разные способы использования.
              Поэтому подписка на обычный стриминг сама по себе не означает
              право использовать музыку в заведении на тех же условиях.
            </p>
            <p className="mt-5 rounded-[20px] bg-[#faf6ff] p-5 text-[19px] font-semibold leading-8">
              Бизнесу нужна понятная цепочка: кто имеет права → кто разрешил
              использование → как фиксируется воспроизведение → кому
              выплачивается вознаграждение.
            </p>
          </section>

          <section className={cardClass}>
            <h2 className="text-[28px] font-semibold">Что делает АудиоЛад</h2>
            <div className={"mt-4 space-y-4 " + bodyClass}>
              <p>
                Правообладатель публикует музыку на АудиоЛаде и сохраняет свои
                права.
              </p>
              <p>
                Для использования музыки бизнесом он отдельно предоставляет
                АудиоЛаду необходимый объём прав и разрешает предоставлять их
                клиентам «АудиоЛад Бизнес».
              </p>
              <p>
                Клиент использует допущенную музыку через управляемый плеер, а
                система фиксирует, какие треки и когда звучали.
              </p>
            </div>
            <p className="mt-5 rounded-[20px] bg-[#e8f7ee] p-5 text-[19px] font-semibold leading-8">
              Мы не создаём отдельную «секретную музыку для ресторанов».
              Публичный трек может дополнительно работать для бизнеса и
              приносить правообладателю отдельное вознаграждение.
            </p>
          </section>

          <section className={cardClass}>
            <h2 className="text-[28px] font-semibold">Как мы проверяем музыку</h2>
            <ul className="mt-4 list-disc space-y-3 pl-6 text-[18px] leading-8 text-[#4c3d78] marker:text-[#7042c5]">
              <li>проверяем происхождение музыки и используемый ИИ-сервис;</li>
              <li>проверяем право на коммерческое использование по тарифу и условиям сервиса;</li>
              <li>при первом подключении музыканта проверяем один реальный продукт;</li>
              <li>не допускаем неоформленные чужие треки, семплы, голоса и иные спорные материалы;</li>
              <li>храним договорную и техническую цепочку подтверждений.</li>
            </ul>
          </section>

          <section className={cardClass}>
            <h2 className="text-[28px] font-semibold">Что получает бизнес-клиент</h2>
            <ul className="mt-4 list-disc space-y-3 pl-6 text-[18px] leading-8 text-[#4c3d78] marker:text-[#7042c5]">
              <li>доступ только к музыке, допущенной в каталог для бизнеса;</li>
              <li>договорный контур использования музыки;</li>
              <li>журнал фактического воспроизведения по точке и устройству;</li>
              <li>пакет подтверждения прав и происхождения музыки;</li>
              <li>поддержку АудиоЛада по вопросам музыки из нашего каталога.</li>
            </ul>
            <p className="mt-5 rounded-[20px] bg-[#fff6de] p-5 text-[17px] leading-7 text-[#5c4715]">
              Если в помещении параллельно звучит радио, другой стриминг или
              собственные сторонние файлы, правовой пакет АудиоЛада на эту
              музыку не распространяется.
            </p>
          </section>

          <section className={cardClass}>
            <h2 className="text-[28px] font-semibold">На что опирается модель</h2>
            <p className={"mt-4 " + bodyClass}>
              На механизмы Гражданского кодекса РФ: неисключительную лицензию,
              сублицензию с согласия правообладателя, электронную форму согласия
              и заверения о наличии прав и разрешений. Отдельно учитываются
              правила коллективного управления правами, включая РАО и ВОИС.
            </p>
            <p className={"mt-4 " + bodyClass}>
              Там, где законодательство и судебная практика ещё развиваются, мы
              не выдаём рабочую гипотезу за установленное правило. Правовая
              модель обновляется вместе с законом и судебными решениями.
            </p>
          </section>

          <section className="rounded-[28px] bg-[#25135c] p-7 text-white lg:p-9">
            <h2 className="text-[28px] font-semibold">Подробная правовая модель</h2>
            <p className="mt-4 text-[18px] leading-8 text-[#eee8ff]">
              Публикуем полную модель: договорную цепочку, проверку
              происхождения нейромузыки, работу с РАО и ВОИС, доказательства и
              зоны, где практика ещё формируется.
            </p>
            <Link
              href="/pravovaya-model-muzyki"
              className="mt-6 inline-flex rounded-full bg-white px-6 py-3 font-semibold text-[#6234b5]"
            >
              Читать полную правовую модель
            </Link>
          </section>
        </div>

        <LegalLinksNav className="mt-10 border-t border-[#eadff8] pt-7" />
      </div>
    </main>
  );
}
