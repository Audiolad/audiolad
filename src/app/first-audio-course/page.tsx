import type { Metadata } from "next";
import Link from "next/link";

import BuyPracticeButton from "@/components/BuyPracticeButton";
import BottomNav from "@/components/BottomNav";
import LegalFooter from "@/components/LegalFooter";
import PrimaryNav from "@/components/PrimaryNav";
import PurchaseConsent from "@/components/PurchaseConsent";
import { platformNavPaddingClass } from "@/lib/navigation/bottom-nav";

const FIRST_AUDIO_COURSE_SLUG = "first-audio-course";

export const metadata: Metadata = {
  title: "Ваш голос уже может стать цифровым продуктом – АудиоЛад",
  description:
    "Авторский аудиоподкаст для экспертов о том, как превратить знания, опыт и живой голос в первый цифровой аудиопродукт.",
};

type SectionProps = {
  title: string;
  children: React.ReactNode;
  className?: string;
};

function Section({ title, children, className }: SectionProps) {
  return (
    <section className={`mt-9 ${className ?? ""}`}>
      <h2 className="text-[22px] font-semibold leading-tight text-[#25135c]">
        {title}
      </h2>
      <div className="mt-4 text-[15px] leading-6 text-[#6f61a3]">
        {children}
      </div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7042c5]"
          />
          <span className="text-[#4c3d78]">{item}</span>
        </li>
      ))}
    </ul>
  );
}

const cardClassName =
  "lg:mt-0 lg:rounded-[22px] lg:border lg:border-[#eadff8] lg:bg-white lg:p-7";

export default function FirstAudioCoursePage() {
  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] shadow-sm lg:max-w-[1180px] ${platformNavPaddingClass}`}
      >
        <div className="px-5 pb-8 pt-6 lg:px-12 lg:pt-8">
          <header className="mb-1 hidden items-center justify-between border-b border-[#eadff8] pb-5 lg:flex">
            <Link
              href="/"
              className="text-[26px] font-semibold text-[#6234b5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              АудиоЛад
            </Link>
            <PrimaryNav className="flex items-center gap-8" />
          </header>

          <header className="border-b border-[#eadff8] pb-5 lg:hidden">
            <Link
              href="/"
              className="text-[28px] font-semibold leading-none text-[#6234b5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              АудиоЛад
            </Link>
          </header>

          <section className="mt-6 lg:mt-10 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-12 lg:gap-y-10">
            <div className="lg:col-start-1 lg:row-start-1">
              <span className="inline-flex rounded-full bg-[#f1e4fc] px-3 py-1 text-xs font-medium text-[#7042c5]">
                Авторский аудиоподкаст
              </span>

              <h1 className="mt-4 text-[26px] font-semibold leading-[1.2] lg:text-[38px] lg:leading-[1.15]">
                Ваш голос уже может стать цифровым продуктом
              </h1>

              <p className="mt-4 text-[15px] leading-6 text-[#6f61a3] lg:text-[17px] lg:leading-7">
                Как превратить свои знания, опыт и состояние в свой первый
                авторский аудиопродукт – аудиопрактику, медитацию или
                аудиокурс, чтобы помогать людям и получать достойное
                вознаграждение
              </p>
            </div>

            <div className="mt-6 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:mt-0 lg:self-start lg:rounded-[26px] lg:border lg:border-[#eadff8] lg:bg-white lg:p-6 lg:shadow-[0_18px_44px_rgba(96,59,168,0.10)]">
              <dl className="overflow-hidden rounded-[22px] border border-[#eadff8] bg-white lg:rounded-[18px]">
                <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <dt className="text-sm text-[#8c7dab]">Формат</dt>
                  <dd className="text-right text-[15px] font-medium text-[#25135c]">
                    Авторский аудиоподкаст, MP3
                  </dd>
                </div>
                <div className="border-t border-[#eee6f7]" />
                <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <dt className="text-sm text-[#8c7dab]">Вид продукта</dt>
                  <dd className="text-right text-[15px] font-medium text-[#25135c]">
                    Цифровой аудиопродукт
                  </dd>
                </div>
                <div className="border-t border-[#eee6f7]" />
                <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <dt className="text-sm text-[#8c7dab]">Продолжительность</dt>
                  <dd className="text-right text-[15px] font-medium text-[#25135c]">
                    11 мин 28 сек
                  </dd>
                </div>
                <div className="border-t border-[#eee6f7]" />
                <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <dt className="text-sm text-[#8c7dab]">Способ получения</dt>
                  <dd className="max-w-[220px] text-right text-[15px] font-medium text-[#25135c]">
                    Онлайн-доступ в личном кабинете после оплаты
                  </dd>
                </div>
                <div className="border-t border-[#eee6f7]" />
                <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <dt className="text-sm text-[#8c7dab]">Доставка</dt>
                  <dd className="max-w-[220px] text-right text-[15px] font-medium text-[#25135c]">
                    Не требуется; физическая доставка не осуществляется
                  </dd>
                </div>
                <div className="border-t border-[#eee6f7]" />
                <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <dt className="text-sm text-[#8c7dab]">Цена</dt>
                  <dd className="text-right text-[19px] font-semibold text-[#7042c5]">
                    99 ₽
                  </dd>
                </div>
              </dl>

              <BuyPracticeButton
                practiceSlug={FIRST_AUDIO_COURSE_SLUG}
                label="Купить аудиоподкаст"
                signInReturnPath="/first-audio-course"
                className="mt-5 w-full rounded-[22px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-5 py-4 text-[17px] font-semibold text-white shadow-[0_14px_34px_rgba(96,59,168,0.24)] transition hover:opacity-95 disabled:cursor-wait disabled:opacity-70"
              />
              <PurchaseConsent className="mt-3" />
            </div>

            <div className="mt-9 lg:col-start-1 lg:row-start-2 lg:mt-0">
              <h2 className="text-[22px] font-semibold leading-tight text-[#25135c]">
                Краткое описание
              </h2>
              <p className="mt-4 text-[15px] leading-6 text-[#6f61a3]">
                Короткий авторский аудиоподкаст для экспертов, наставников,
                психологов, энергопрактиков и других авторов, которые хотят
                превратить свои знания, опыт и живой голос в первый цифровой
                аудиопродукт.
              </p>
              <p className="mt-4 text-[15px] leading-6 text-[#6f61a3]">
                Вы узнаете, почему для старта не нужны большая студия, сложная
                техника и многочасовой курс, чем живой голос особенно ценен в
                эпоху нейросетей и с какого простого шага начать создание своей
                аудиопрактики, медитации или аудиокурса на «АудиоЛаде».
              </p>
            </div>
          </section>

          <div className="lg:mt-14 lg:grid lg:grid-cols-2 lg:gap-6">
            <Section title="Для кого" className={cardClassName}>
              <BulletList
                items={[
                  "экспертов и консультантов",
                  "наставников",
                  "психологов",
                  "энергопрактиков",
                  "авторов медитаций и аудиопрактик",
                  "преподавателей",
                  "специалистов помогающих профессий",
                  "людей, у которых есть знания и опыт, но ещё нет собственного цифрового аудиопродукта",
                ]}
              />
            </Section>

            <Section title="Что вы узнаете" className={cardClassName}>
              <BulletList
                items={[
                  "почему первый цифровой продукт не обязан быть большим курсом",
                  "как выбрать тему для своей первой аудиопрактики, медитации или аудиокурса",
                  "почему голос передаёт не только информацию, но и состояние автора",
                  "чем живое авторское аудио отличается от материалов, созданных нейросетями",
                  "какие преимущества аудиоформат даёт экспертам и помогающим практикам",
                  "как сделать первый шаг к созданию собственного аудиопродукта на «АудиоЛаде»",
                ]}
              />
            </Section>

            <Section title="Что входит" className={cardClassName}>
              <BulletList
                items={[
                  "Полный авторский аудиоподкаст в формате MP3.",
                  "Онлайн-прослушивание на сайте после оплаты.",
                  "Доступ к материалу без ограничения по времени.",
                  "Понятная структура от идеи до первого цифрового аудиопродукта.",
                ]}
              />
            </Section>

            <Section title="Как вы получите доступ" className={cardClassName}>
              <p>
                Сразу после оплаты аудиоподкаст станет доступен для прослушивания
                на сайте. Материал можно слушать онлайн в любое время – доступ
                сохраняется без ограничения по сроку.
              </p>
            </Section>

            <Section
              title="Порядок возврата"
              className={`${cardClassName} lg:col-span-2`}
            >
              <p>
                Если после оплаты доступ к аудиоподкасту не был предоставлен или
                возникла техническая ошибка, вы можете запросить возврат. Для
                этого напишите на{" "}
                <a
                  href="mailto:1@audiolad.ru"
                  className="text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                >
                  1@audiolad.ru
                </a>{" "}
                с указанием даты и суммы оплаты. Возврат производится на тот же
                способ оплаты в соответствии с условиями оферты.
              </p>
            </Section>
          </div>

          <LegalFooter className="mt-12" />
        </div>
      </div>
      <BottomNav />
    </main>
  );
}
