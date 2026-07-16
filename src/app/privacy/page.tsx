import type { Metadata } from "next";
import Link from "next/link";

import LegalPageShell from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Политика обработки персональных данных – АудиоЛад",
  description:
    "Политика обработки и защиты персональных данных пользователей сайта «АудиоЛад».",
};

const linkClassName =
  "text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

const bodyClassName = "text-[15px] leading-7 text-[#4c3d78]";
const sectionTitleClassName =
  "text-[22px] font-semibold leading-tight text-[#25135c]";

type RequisiteItemProps = {
  label: string;
  children: React.ReactNode;
};

function RequisiteItem({ label, children }: RequisiteItemProps) {
  return (
    <div className="mt-4 first:mt-0">
      <p className="text-sm font-medium text-[#7d70a2]">{label}</p>
      <div className="mt-1.5 break-words text-[15px] leading-6 text-[#25135c]">
        {children}
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10" aria-labelledby={id}>
      <h2 id={id} className={sectionTitleClassName}>
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-[#7042c5]">
      {items.map((item) => (
        <li key={item} className={bodyClassName}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function PrivacyPage() {
  return (
    <LegalPageShell>
      <div className="px-5 pb-8 pt-6 lg:px-12 lg:pt-10">
          <header className="border-b border-[#eadff8] pb-5">
            <Link
              href="/"
              className="text-[28px] font-semibold leading-none text-[#6234b5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              АудиоЛад
            </Link>
          </header>

          <h1 className="mt-6 text-[28px] font-semibold leading-tight lg:text-[32px]">
            Политика обработки персональных данных
          </h1>

          <p className="mt-3 text-[17px] leading-6 text-[#4c3d78] lg:text-[18px]">
            сайта «АудиоЛад»
          </p>

          <p className="mt-3 text-sm leading-6 text-[#8c7dab]">
            Последнее обновление: 13 июля 2026 года
          </p>

          <Section id="section-1" title="1. Общие положения">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">1.1.</strong>{" "}
              Настоящая Политика обработки персональных данных определяет порядок
              обработки и защиты персональных данных пользователей сайта
              «АудиоЛад», расположенного по адресу:{" "}
              <a
                href="https://audiolad.ru"
                className={linkClassName}
                rel="noopener noreferrer"
              >
                https://audiolad.ru
              </a>
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">1.2.</strong>{" "}
              Политика разработана в соответствии с Федеральным законом
              Российской Федерации № 152-ФЗ «О персональных данных», а также
              иными нормативными правовыми актами Российской Федерации.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">1.3.</strong>{" "}
              Использование сайта означает согласие пользователя с настоящей
              Политикой.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">1.4.</strong>{" "}
              Если пользователь не согласен с условиями настоящей Политики, он
              должен прекратить использование сайта.
            </p>
          </Section>

          <Section id="section-2" title="2. Оператор персональных данных">
            <p className={bodyClassName}>
              Оператором персональных данных является:
            </p>

            <p className={`${bodyClassName} font-semibold text-[#25135c]`}>
              Индивидуальный предприниматель Петров Сергей Сергеевич
            </p>

            <div className="space-y-1">
              <p className="text-sm font-medium text-[#7d70a2]">ИНН</p>
              <p className="text-[15px] leading-6 text-[#25135c]">
                507305817690
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-[#7d70a2]">ОГРНИП</p>
              <p className="text-[15px] leading-6 text-[#25135c]">
                316505300063237
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-[#7d70a2]">
                Адрес регистрации
              </p>
              <p className="text-[15px] leading-6 text-[#25135c]">
                355045, г. Ставрополь, ул. 45 Параллель, д. 73, кв. 45
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-[#7d70a2]">
                Электронная почта
              </p>
              <p className="text-[15px] leading-6 text-[#25135c]">
                <a href="mailto:1@audiolad.ru" className={linkClassName}>
                  1@audiolad.ru
                </a>
              </p>
            </div>
          </Section>

          <Section id="section-3" title="3. Какие данные мы обрабатываем">
            <p className={bodyClassName}>
              При использовании сайта могут обрабатываться следующие персональные
              данные пользователя:
            </p>

            <BulletList
              items={[
                "имя или отображаемое имя;",
                "адрес электронной почты;",
                "пароль в защищённом виде;",
                "сведения о приобретённых цифровых аудиопродуктах;",
                "история заказов;",
                "информация, необходимая для исполнения договора с пользователем;",
                "технические сведения о работе сайта, необходимые для обеспечения его функционирования.",
              ]}
            />

            <p className={bodyClassName}>
              Сайт не собирает специальные категории персональных данных,
              предусмотренные законодательством Российской Федерации.
            </p>
          </Section>

          <Section id="section-4" title="4. Цели обработки персональных данных">
            <p className={bodyClassName}>
              Персональные данные обрабатываются исключительно для следующих
              целей:
            </p>

            <BulletList
              items={[
                "регистрация пользователя;",
                "создание личного кабинета;",
                "предоставление доступа к приобретённым цифровым аудиопродуктам;",
                "исполнение договора купли-продажи;",
                "обработка обращений пользователей;",
                "обеспечение безопасности сайта;",
                "восстановление доступа к аккаунту;",
                "исполнение требований законодательства Российской Федерации.",
              ]}
            />
          </Section>

          <Section
            id="section-5"
            title="5. Основания обработки персональных данных"
          >
            <p className={bodyClassName}>
              Обработка персональных данных осуществляется на основании:
            </p>

            <BulletList
              items={[
                "согласия пользователя;",
                "заключения и исполнения договора;",
                "требований законодательства Российской Федерации.",
              ]}
            />
          </Section>

          <Section id="section-6" title="6. Порядок обработки персональных данных">
            <p className={bodyClassName}>
              Персональные данные обрабатываются с использованием
              автоматизированных средств.
            </p>

            <p className={bodyClassName}>
              Оператор принимает необходимые организационные и технические меры
              для защиты персональных данных от неправомерного доступа,
              изменения, раскрытия, уничтожения или иных неправомерных действий.
            </p>

            <p className={bodyClassName}>
              Доступ к персональным данным имеют только лица, которым он
              необходим для исполнения своих обязанностей.
            </p>
          </Section>

          <Section id="section-7" title="7. Платёжная информация">
            <p className={bodyClassName}>
              Оплата цифровых аудиопродуктов осуществляется посредством
              интернет-эквайринга ООО «Банк Точка».
            </p>

            <p className={bodyClassName}>
              Данные банковских карт пользователей не поступают в распоряжение
              Оператора, не обрабатываются им и не хранятся на сайте «АудиоЛад».
            </p>
          </Section>

          <Section id="section-8" title="8. Файлы cookie">
            <p className={bodyClassName}>
              Сайт использует технически необходимые файлы cookie, обеспечивающие
              корректную работу сайта и авторизацию пользователей.
            </p>

            <p className={bodyClassName}>
              Для понимания использования сайта может применяться сервис веб-аналитики
              Яндекс Метрика (ООО «Яндекс», Россия). Метрика помогает собирать
              обезличенную статистику посещений, переходов между страницами и
              ключевых действий на сайте.
            </p>

            <p className={bodyClassName}>
              Яндекс Метрика загружается только после явного согласия пользователя
              через баннер на сайте или переключатель в разделе «Настройки →
              Конфиденциальность». До выбора решения Метрика не используется.
            </p>

            <p className={bodyClassName}>
              Яндекс Метрика может использовать аналитические cookie и технологии,
              сходные с cookie. Через Метрику не передаются email, имя, телефон,
              идентификаторы аккаунта, содержимое форм и другие персональные данные
              пользователя.
            </p>

            <p className={bodyClassName}>
              На сайте не используются Вебвизор, карты кликов и аналитика форм
              Яндекс Метрики. Пользователь может изменить решение в разделе
              «Настройки → Конфиденциальность».
            </p>

            <p className={bodyClassName}>
              Подробнее о правилах обработки данных Яндексом:{" "}
              <a
                href="https://yandex.ru/legal/confidential/"
                className="text-[#7042c5] underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                yandex.ru/legal/confidential
              </a>
              .
            </p>
          </Section>

          <Section id="section-9" title="9. Хранение персональных данных">
            <p className={bodyClassName}>
              Персональные данные хранятся только в течение срока, необходимого
              для достижения целей обработки, либо в течение срока,
              установленного законодательством Российской Федерации.
            </p>

            <p className={bodyClassName}>
              По истечении указанного срока персональные данные подлежат
              удалению либо обезличиванию, если иное не предусмотрено
              законодательством Российской Федерации.
            </p>
          </Section>

          <Section id="section-10" title="10. Передача персональных данных">
            <p className={bodyClassName}>
              Оператор не продаёт персональные данные пользователей и не передаёт
              их третьим лицам, за исключением случаев:
            </p>

            <BulletList
              items={[
                "когда это необходимо для исполнения требований законодательства Российской Федерации;",
                "когда передача необходима для исполнения договора с пользователем;",
                "когда пользователь дал отдельное согласие на такую передачу.",
              ]}
            />
          </Section>

          <Section id="section-11" title="11. Права пользователя">
            <p className={bodyClassName}>Пользователь имеет право:</p>

            <ul className="list-disc space-y-2 pl-5 marker:text-[#7042c5]">
              {[
                "получать сведения об обработке своих персональных данных;",
                "требовать уточнения своих персональных данных;",
                "требовать удаления персональных данных в случаях, предусмотренных законодательством;",
                "отозвать согласие на обработку персональных данных;",
              ].map((item) => (
                <li key={item} className={bodyClassName}>
                  {item}
                </li>
              ))}
              <li className={bodyClassName}>
                обращаться с вопросами по обработке персональных данных по
                адресу{" "}
                <a href="mailto:1@audiolad.ru" className={linkClassName}>
                  1@audiolad.ru
                </a>
                .
              </li>
            </ul>
          </Section>

          <Section id="section-12" title="12. Удаление аккаунта">
            <p className={bodyClassName}>
              Пользователь вправе обратиться к Оператору с просьбой об удалении
              своего аккаунта и персональных данных.
            </p>

            <p className={bodyClassName}>
              После получения обращения Оператор удаляет персональные данные
              пользователя, за исключением сведений, которые обязан хранить в
              соответствии с законодательством Российской Федерации, включая
              сведения бухгалтерского и налогового учёта.
            </p>
          </Section>

          <Section id="section-13" title="13. Защита персональных данных">
            <p className={bodyClassName}>
              Оператор принимает необходимые правовые, организационные и
              технические меры для обеспечения безопасности персональных данных
              в соответствии с требованиями законодательства Российской
              Федерации.
            </p>
          </Section>

          <Section id="section-14" title="14. Изменение Политики">
            <p className={bodyClassName}>
              Оператор вправе вносить изменения в настоящую Политику.
            </p>

            <p className={bodyClassName}>
              Новая редакция вступает в силу с момента её публикации на сайте,
              если иной срок не установлен новой редакцией.
            </p>
          </Section>

          <Section id="section-15" title="15. Контактная информация">
            <p className={bodyClassName}>
              По вопросам обработки персональных данных пользователь может
              обратиться:
            </p>

            <div className="space-y-1">
              <p className="text-sm font-medium text-[#7d70a2]">
                Электронная почта
              </p>
              <p className="text-[15px] leading-6 text-[#25135c]">
                <a href="mailto:1@audiolad.ru" className={linkClassName}>
                  1@audiolad.ru
                </a>
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-[#7d70a2]">Сайт</p>
              <p className="text-[15px] leading-6 text-[#25135c]">
                <a
                  href="https://audiolad.ru"
                  className={linkClassName}
                  rel="noopener noreferrer"
                >
                  https://audiolad.ru
                </a>
              </p>
            </div>
          </Section>

          <section className="mt-10" aria-labelledby="operator-requisites">
            <h2 id="operator-requisites" className={sectionTitleClassName}>
              Реквизиты Оператора
            </h2>

            <div className="mt-4 overflow-hidden rounded-[22px] border border-[#eadff8] bg-gradient-to-r from-[#faf4ff] to-[#f1e4fc] p-6 lg:p-7">
              <RequisiteItem label="Индивидуальный предприниматель">
                Петров Сергей Сергеевич
              </RequisiteItem>

              <RequisiteItem label="ИНН">507305817690</RequisiteItem>

              <RequisiteItem label="ОГРНИП">316505300063237</RequisiteItem>

              <RequisiteItem label="Адрес регистрации">
                355045, г. Ставрополь, ул. 45 Параллель, д. 73, кв. 45
              </RequisiteItem>
            </div>
          </section>

          <div className="mt-10 border-t border-[#eadff8] pt-6">
            <p className="text-sm leading-6 text-[#8c7dab]">
              <em>
                Документ опубликован в электронной форме и действует до момента
                размещения новой редакции на сайте.
              </em>
            </p>
          </div>
        </div>
    </LegalPageShell>
  );
}
