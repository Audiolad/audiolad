import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Публичная оферта – АудиоЛад",
  description:
    "Публичная оферта о продаже цифровых аудиопродуктов на сайте «АудиоЛад».",
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

export default function OfferPage() {
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
            Публичная оферта
          </h1>

          <p className="mt-3 text-[17px] leading-6 text-[#4c3d78] lg:text-[18px]">
            о продаже цифровых аудиопродуктов на сайте «АудиоЛад»
          </p>

          <p className="mt-3 text-sm leading-6 text-[#8c7dab]">
            Последнее обновление: 13 июля 2026 года
          </p>

          <Section id="section-1" title="1. Общие положения">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">1.1.</strong>{" "}
              Настоящий документ является публичной офертой Индивидуального
              предпринимателя Петрова Сергея Сергеевича (далее – Продавец) о
              заключении договора купли-продажи цифровых аудиопродуктов
              посредством сайта «АудиоЛад», расположенного по адресу:{" "}
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
              Сайт «АудиоЛад» предназначен для продажи и предоставления доступа
              к цифровым аудиопродуктам, включая аудиолекции, аудиокурсы,
              аудиокниги, подкасты, аудиопрактики, медитации и иные авторские
              аудиоматериалы.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">1.3.</strong> В
              соответствии со статьями 435 и 437 Гражданского кодекса
              Российской Федерации настоящий документ является публичной
              офертой.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">1.4.</strong>{" "}
              Оплата выбранного цифрового аудиопродукта означает полное и
              безоговорочное принятие Покупателем условий настоящей оферты.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">1.5.</strong> До
              совершения оплаты Покупатель обязан ознакомиться с настоящей
              офертой.
            </p>
          </Section>

          <Section id="section-2" title="2. Термины">
            <p className={bodyClassName}>
              В настоящей оферте используются следующие понятия.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">Сайт</strong> –
              интернет-сайт «АудиоЛад», расположенный по адресу{" "}
              <a
                href="https://audiolad.ru"
                className={linkClassName}
                rel="noopener noreferrer"
              >
                https://audiolad.ru
              </a>
              .
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">Продавец</strong>{" "}
              – Индивидуальный предприниматель Петров Сергей Сергеевич.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">Покупатель</strong>{" "}
              – физическое лицо, приобретающее цифровые аудиопродукты
              посредством Сайта.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">
                Цифровой аудиопродукт
              </strong>{" "}
              – электронный цифровой материал, предоставляемый в аудиоформате.
            </p>

            <p className={bodyClassName}>
              К цифровым аудиопродуктам относятся, в том числе:
            </p>

            <BulletList
              items={[
                "аудиолекции;",
                "аудиокурсы;",
                "аудиокниги;",
                "подкасты;",
                "аудиопрактики;",
                "медитации;",
                "иные цифровые аудиоматериалы.",
              ]}
            />
          </Section>

          <Section id="section-3" title="3. Предмет договора">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">3.1.</strong>{" "}
              Продавец предоставляет Покупателю доступ к выбранному цифровому
              аудиопродукту после подтверждения оплаты.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">3.2.</strong>{" "}
              Покупатель оплачивает выбранный цифровой аудиопродукт на условиях
              настоящей оферты.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">3.3.</strong>{" "}
              Описание, стоимость, состав, продолжительность и иные
              характеристики каждого цифрового аудиопродукта публикуются на
              соответствующей странице Сайта.
            </p>
          </Section>

          <Section id="section-4" title="4. Оформление заказа">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">4.1.</strong>{" "}
              Покупатель самостоятельно выбирает цифровой аудиопродукт.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">4.2.</strong>{" "}
              После оформления заказа Покупатель переходит на защищённую
              страницу оплаты.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">4.3.</strong>{" "}
              Договор считается заключённым с момента подтверждения успешной
              оплаты.
            </p>
          </Section>

          <Section id="section-5" title="5. Стоимость и порядок оплаты">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">5.1.</strong>{" "}
              Стоимость каждого цифрового аудиопродукта указывается на странице
              соответствующего продукта.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">5.2.</strong> Все
              расчёты осуществляются в российских рублях.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">5.3.</strong>{" "}
              Оплата производится посредством подключённой на Сайте платёжной
              системы.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">5.4.</strong>{" "}
              Обязанность Покупателя по оплате считается исполненной после
              подтверждения успешного платежа.
            </p>
          </Section>

          <Section id="section-6" title="6. Предоставление доступа">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">6.1.</strong>{" "}
              После подтверждения оплаты Продавец предоставляет Покупателю
              доступ к приобретённому цифровому аудиопродукту.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">6.2.</strong>{" "}
              Доступ предоставляется посредством функционала сайта «АудиоЛад»
              либо иным способом, указанным в описании соответствующего
              продукта.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">6.3.</strong>{" "}
              Если иное не указано в описании продукта, доступ предоставляется
              без ограничения срока.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">6.4.</strong>{" "}
              Предоставленный доступ является персональным.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">6.5.</strong>{" "}
              Покупатель обязуется не передавать доступ к приобретённому
              цифровому аудиопродукту третьим лицам, не распространять его и не
              использовать способами, нарушающими авторские права Продавца.
            </p>
          </Section>

          <Section id="section-7" title="7. Авторские права">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">7.1.</strong> Все
              цифровые аудиопродукты являются объектами авторского права и
              охраняются законодательством Российской Федерации.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">7.2.</strong>{" "}
              Покупателю предоставляется право использования приобретённого
              цифрового аудиопродукта исключительно для личного использования.
            </p>

            <p className={bodyClassName}>
              Без письменного согласия Продавца запрещается:
            </p>

            <BulletList
              items={[
                "копировать цифровые аудиопродукты;",
                "распространять их полностью или частично;",
                "передавать доступ третьим лицам;",
                "публиковать материалы в сети Интернет;",
                "использовать цифровые аудиопродукты в коммерческих целях.",
              ]}
            />
          </Section>

          <Section id="section-8" title="8. Обновление цифровых аудиопродуктов">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">8.1.</strong>{" "}
              Продавец вправе дополнять, обновлять и улучшать цифровые
              аудиопродукты.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">8.2.</strong>{" "}
              Такие изменения не считаются нарушением условий настоящей оферты и
              направлены на повышение качества предоставляемых материалов.
            </p>
          </Section>

          <Section id="section-9" title="9. Возврат денежных средств">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">9.1.</strong>{" "}
              Возврат денежных средств осуществляется в соответствии с
              законодательством Российской Федерации.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">9.2.</strong>{" "}
              Если Покупатель не получил доступ к приобретённому цифровому
              аудиопродукту вследствие технической ошибки Сайта, он вправе
              обратиться по адресу:{" "}
              <a href="mailto:1@audiolad.ru" className={linkClassName}>
                1@audiolad.ru
              </a>
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">9.3.</strong>{" "}
              Каждое обращение рассматривается в соответствии с
              законодательством Российской Федерации и обстоятельствами
              конкретной ситуации.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">9.4.</strong> При
              подтверждении технической невозможности предоставить оплаченный
              цифровой аудиопродукт Продавец предоставляет доступ либо
              осуществляет возврат денежных средств.
            </p>
          </Section>

          <Section id="section-10" title="10. Ответственность сторон">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">10.1.</strong>{" "}
              Продавец не несёт ответственности за невозможность использования
              цифровых аудиопродуктов по причинам, не зависящим от него,
              включая проблемы с оборудованием, программным обеспечением или
              доступом Покупателя к сети Интернет.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">10.2.</strong>{" "}
              Продавец не гарантирует достижение Покупателем каких-либо
              профессиональных, финансовых, образовательных или иных
              результатов вследствие использования цифровых аудиопродуктов.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">10.3.</strong>{" "}
              Цифровые аудиопродукты предназначены для самостоятельного изучения
              и применения.
            </p>
          </Section>

          <Section id="section-11" title="11. Заключительные положения">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">11.1.</strong>{" "}
              Настоящая оферта регулируется законодательством Российской
              Федерации.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">11.2.</strong>{" "}
              Все возникающие разногласия стороны стремятся разрешить путём
              переговоров.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">11.3.</strong>{" "}
              Если соглашение не достигнуто, спор рассматривается в порядке,
              установленном законодательством Российской Федерации.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">11.4.</strong>{" "}
              Продавец вправе вносить изменения в настоящую оферту. Новая
              редакция вступает в силу с момента её публикации на Сайте.
            </p>
          </Section>

          <section className="mt-10" aria-labelledby="section-12">
            <h2 id="section-12" className={sectionTitleClassName}>
              12. Реквизиты Продавца
            </h2>

            <div className="mt-4 overflow-hidden rounded-[22px] border border-[#eadff8] bg-gradient-to-r from-[#faf4ff] to-[#f1e4fc] p-6 lg:p-7">
              <RequisiteItem label="Продавец">
                Индивидуальный предприниматель Петров Сергей Сергеевич
              </RequisiteItem>

              <RequisiteItem label="ИНН">507305817690</RequisiteItem>

              <RequisiteItem label="ОГРНИП">316505300063237</RequisiteItem>

              <RequisiteItem label="Адрес регистрации">
                355045, г. Ставрополь, ул. 45 Параллель, д. 73, кв. 45
              </RequisiteItem>

              <RequisiteItem label="Расчётный счёт">
                40802810720000122219
              </RequisiteItem>

              <RequisiteItem label="Банк">ООО «Банк Точка»</RequisiteItem>

              <RequisiteItem label="БИК">044525104</RequisiteItem>

              <RequisiteItem label="Корреспондентский счёт">
                30101810745374525104
              </RequisiteItem>

              <RequisiteItem label="Электронная почта">
                <a href="mailto:1@audiolad.ru" className={linkClassName}>
                  1@audiolad.ru
                </a>
              </RequisiteItem>

              <RequisiteItem label="Сайт">
                <a
                  href="https://audiolad.ru"
                  className={linkClassName}
                  rel="noopener noreferrer"
                >
                  https://audiolad.ru
                </a>
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
