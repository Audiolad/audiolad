import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Оплата, получение и возврат – АудиоЛад",
  description:
    "Порядок оплаты, получения цифровых аудиопродуктов и возврата денежных средств на сайте «АудиоЛад».",
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

function OrderedList({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 marker:text-[#7042c5]">
      {items.map((item) => (
        <li key={item} className={bodyClassName}>
          {item}
        </li>
      ))}
    </ol>
  );
}

export default function PaymentAndRefundPage() {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface pb-10 lg:max-w-[820px]">
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
            Оплата, получение и возврат
          </h1>

          <p className="mt-3 text-[17px] leading-6 text-[#4c3d78] lg:text-[18px]">
            цифровых аудиопродуктов сайта «АудиоЛад»
          </p>

          <p className="mt-3 text-sm leading-6 text-[#8c7dab]">
            Последнее обновление: 13 июля 2026 года
          </p>

          <Section id="section-1" title="1. Общие положения">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">1.1.</strong>{" "}
              Настоящий документ определяет порядок оплаты цифровых
              аудиопродуктов, предоставления доступа к ним и порядок
              рассмотрения обращений, связанных с возвратом денежных средств.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">1.2.</strong>{" "}
              Документ распространяется на все цифровые аудиопродукты,
              размещённые на сайте:{" "}
              <a
                href="https://audiolad.ru"
                className={linkClassName}
                rel="noopener noreferrer"
              >
                https://audiolad.ru
              </a>
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">1.3.</strong>{" "}
              Оплата цифрового аудиопродукта означает согласие пользователя с
              настоящими условиями и{" "}
              <Link href="/offer" className={linkClassName}>
                Публичной офертой
              </Link>
              .
            </p>
          </Section>

          <Section id="section-2" title="2. Способы оплаты">
            <p className={bodyClassName}>
              Оплата цифровых аудиопродуктов осуществляется банковской картой
              через защищённую платёжную страницу интернет-эквайринга ООО «Банк
              Точка».
            </p>

            <p className={bodyClassName}>
              К оплате принимаются банковские карты следующих платёжных систем:
            </p>

            <BulletList items={["МИР;", "Visa;", "Mastercard."]} />

            <p className={bodyClassName}>
              Все расчёты осуществляются в российских рублях.
            </p>

            <p className={bodyClassName}>
              Чтобы оплатить цифровой аудиопродукт банковской картой,
              пользователь:
            </p>

            <OrderedList
              items={[
                "выбирает продукт на сайте «АудиоЛад»;",
                "нажимает кнопку оплаты;",
                "переходит на защищённую платёжную страницу банка;",
                "вводит данные банковской карты;",
                "при необходимости подтверждает операцию с помощью технологии 3-D Secure;",
                "после успешной оплаты возвращается на сайт «АудиоЛад».",
              ]}
            />

            <p className={bodyClassName}>
              Доступность конкретной платёжной системы определяется условиями
              банка, выпустившего карту, и платёжного сервиса.
            </p>
          </Section>

          <Section id="section-3" title="3. Безопасность оплаты">
            <p className={bodyClassName}>
              Оплата производится на защищённой платёжной странице ООО «Банк
              Точка».
            </p>

            <p className={bodyClassName}>
              Для совершения платежа пользователь вводит на платёжной странице
              банка:
            </p>

            <BulletList
              items={[
                "номер банковской карты;",
                "срок действия карты;",
                "имя держателя карты, если это предусмотрено платёжной формой;",
                "защитный код CVC2 или CVV2.",
              ]}
            />

            <p className={bodyClassName}>
              Если банковская карта подключена к технологии 3-D Secure,
              пользователь может быть перенаправлен на страницу банка,
              выпустившего карту, для дополнительного подтверждения операции.
            </p>

            <p className={bodyClassName}>
              Передача платёжных данных осуществляется с использованием
              защищённого соединения.
            </p>

            <p className={bodyClassName}>
              Полные реквизиты банковской карты не поступают на сайт «АудиоЛад»,
              не обрабатываются Оператором и не хранятся на его сервере.
            </p>

            <p className={bodyClassName}>
              Безопасность обработки платёжных данных обеспечивается платёжным
              сервисом ООО «Банк Точка».
            </p>
          </Section>

          <Section id="section-4" title="4. Подтверждение оплаты">
            <p className={bodyClassName}>
              После успешной оплаты пользователь получает подтверждение
              совершённого платежа.
            </p>

            <p className={bodyClassName}>
              При необходимости пользователю могут быть направлены служебные
              уведомления на адрес электронной почты, указанный при регистрации.
            </p>
          </Section>

          <Section id="section-5" title="5. Получение цифрового аудиопродукта">
            <p className={bodyClassName}>
              После подтверждения оплаты пользователю предоставляется доступ к
              приобретённому цифровому аудиопродукту.
            </p>

            <p className={bodyClassName}>
              Доступ осуществляется через личный кабинет пользователя на сайте
              «АудиоЛад», если иное не указано в описании соответствующего
              продукта.
            </p>

            <p className={bodyClassName}>
              Если для конкретного продукта предусмотрен иной способ
              предоставления доступа, он указывается в его описании.
            </p>

            <p className={bodyClassName}>
              Все продукты сайта «АудиоЛад» предоставляются в цифровом виде.
              Физическая доставка товаров, доставка курьером, почтой или в пункт
              выдачи не осуществляется. Стоимость доставки отсутствует.
            </p>
          </Section>

          <Section id="section-6" title="6. Срок предоставления доступа">
            <p className={bodyClassName}>
              Как правило, доступ предоставляется автоматически сразу после
              подтверждения оплаты.
            </p>

            <p className={bodyClassName}>
              При возникновении технических сбоев предоставление доступа может
              занять дополнительное время, необходимое для устранения
              неисправности.
            </p>
          </Section>

          <Section id="section-7" title="7. Если доступ не появился">
            <p className={bodyClassName}>
              Если после успешной оплаты пользователь не получил доступ к
              приобретённому цифровому аудиопродукту, рекомендуется:
            </p>

            <BulletList
              items={[
                "проверить личный кабинет;",
                "убедиться, что вход выполнен под той же учётной записью, с которой была совершена покупка;",
                "проверить электронную почту;",
                "обратиться в службу поддержки.",
              ]}
            />

            <p className={bodyClassName}>
              Обращения принимаются по адресу:{" "}
              <a href="mailto:1@audiolad.ru" className={linkClassName}>
                1@audiolad.ru
              </a>
            </p>

            <p className={bodyClassName}>При обращении желательно указать:</p>

            <BulletList
              items={[
                "адрес электронной почты;",
                "дату покупки;",
                "название приобретённого продукта;",
                "описание возникшей ситуации.",
              ]}
            />
          </Section>

          <Section id="section-8" title="8. Возврат денежных средств">
            <p className={bodyClassName}>
              Возврат денежных средств осуществляется в соответствии с
              законодательством Российской Федерации.
            </p>

            <p className={bodyClassName}>
              Каждое обращение рассматривается индивидуально с учётом
              обстоятельств конкретной ситуации.
            </p>
          </Section>

          <Section id="section-9" title="9. Когда возможен возврат">
            <p className={bodyClassName}>
              Возврат денежных средств может быть осуществлён, если:
            </p>

            <BulletList
              items={[
                "пользователь оплатил цифровой аудиопродукт, но вследствие технической ошибки не получил к нему доступ;",
                "Оператор не имеет возможности предоставить оплаченный цифровой аудиопродукт;",
                "иные случаи предусмотрены законодательством Российской Федерации.",
              ]}
            />

            <p className={bodyClassName}>
              При подтверждении технической ошибки Оператор по своему выбору:
            </p>

            <BulletList
              items={[
                "предоставляет доступ к приобретённому цифровому аудиопродукту;",
                "либо осуществляет возврат денежных средств.",
              ]}
            />
          </Section>

          <Section id="section-10" title="10. Порядок рассмотрения обращения">
            <p className={bodyClassName}>
              Для рассмотрения обращения о возврате денежных средств пользователь
              направляет сообщение по адресу:{" "}
              <a href="mailto:1@audiolad.ru" className={linkClassName}>
                1@audiolad.ru
              </a>
            </p>

            <p className={bodyClassName}>В обращении рекомендуется указать:</p>

            <BulletList
              items={[
                "имя или отображаемое имя;",
                "адрес электронной почты;",
                "дату оплаты;",
                "наименование продукта;",
                "описание возникшей ситуации.",
              ]}
            />

            <p className={bodyClassName}>
              При необходимости Оператор вправе запросить дополнительные
              сведения, подтверждающие факт оплаты.
            </p>
          </Section>

          <Section id="section-11" title="11. Ограничения ответственности">
            <p className={bodyClassName}>
              Оператор не несёт ответственности за невозможность использования
              цифрового аудиопродукта по причинам, не зависящим от него,
              включая:
            </p>

            <BulletList
              items={[
                "отсутствие доступа пользователя к сети Интернет;",
                "неисправность оборудования пользователя;",
                "использование устаревшего программного обеспечения;",
                "действия третьих лиц.",
              ]}
            />
          </Section>

          <Section id="section-12" title="12. Контактная информация">
            <p className={bodyClassName}>
              По вопросам оплаты, получения доступа и возврата денежных средств
              пользователь может обратиться:
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

          <section className="mt-10" aria-labelledby="requisites">
            <h2 id="requisites" className={sectionTitleClassName}>
              Реквизиты
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
      </div>
    </main>
  );
}
