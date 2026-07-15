import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Согласие на обработку персональных данных – АудиоЛад",
  description:
    "Согласие пользователей сайта «АудиоЛад» на обработку персональных данных.",
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

export default function ConsentPage() {
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
            Согласие на обработку персональных данных
          </h1>

          <p className="mt-3 text-[17px] leading-6 text-[#4c3d78] lg:text-[18px]">
            пользователей сайта «АудиоЛад»
          </p>

          <p className="mt-3 text-sm leading-6 text-[#8c7dab]">
            Последнее обновление: 13 июля 2026 года
          </p>

          <Section id="section-1" title="1. Общие положения">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">1.1.</strong>{" "}
              Настоящим пользователь сайта «АудиоЛад», расположенного по адресу:{" "}
              <a
                href="https://audiolad.ru"
                className={linkClassName}
                rel="noopener noreferrer"
              >
                https://audiolad.ru
              </a>{" "}
              свободно, своей волей и в своём интересе даёт согласие на обработку
              своих персональных данных Индивидуальному предпринимателю Петрову
              Сергею Сергеевичу, являющемуся оператором персональных данных.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">1.2.</strong>{" "}
              Согласие предоставляется в соответствии с Федеральным законом
              Российской Федерации № 152-ФЗ «О персональных данных».
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">1.3.</strong>{" "}
              Пользователь подтверждает, что:
            </p>

            <BulletList
              items={[
                "достиг возраста 18 лет;",
                "действует добровольно;",
                "ознакомился с настоящим Согласием;",
                "ознакомился с Политикой обработки персональных данных сайта «АудиоЛад»;",
                "понимает цели и условия обработки персональных данных.",
              ]}
            />
          </Section>

          <Section id="section-2" title="2. Сведения об Операторе">
            <div className="space-y-1">
              <p className="text-sm font-medium text-[#7d70a2]">
                Оператор персональных данных
              </p>
              <p className="text-[15px] leading-6 text-[#25135c]">
                Индивидуальный предприниматель Петров Сергей Сергеевич
              </p>
            </div>

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

          <Section id="section-3" title="3. Перечень персональных данных">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">3.1.</strong>{" "}
              Пользователь даёт согласие на обработку следующих персональных
              данных:
            </p>

            <BulletList
              items={[
                "имя или отображаемое имя;",
                "адрес электронной почты;",
                "данные, используемые для авторизации, включая пароль в защищённом виде;",
                "сведения о регистрации и учётной записи;",
                "сведения о приобретённых цифровых аудиопродуктах;",
                "история заказов и предоставления доступа к материалам;",
                "сведения об оплате, за исключением полных данных банковской карты;",
                "содержание обращений пользователя;",
                "технические данные, необходимые для работы сайта и обеспечения безопасности, включая IP-адрес, сведения о браузере, устройстве, операционной системе, дате и времени обращения к сайту;",
                "технически необходимые файлы cookie;",
                "иные сведения, которые пользователь самостоятельно предоставляет Оператору при использовании сайта.",
              ]}
            />

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">3.2.</strong>{" "}
              Оператор не осуществляет обработку специальных категорий
              персональных данных, касающихся расовой или национальной
              принадлежности, политических взглядов, религиозных или
              философских убеждений, состояния здоровья или интимной жизни.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">3.3.</strong>{" "}
              Оператор не осуществляет обработку биометрических персональных
              данных.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">3.4.</strong>{" "}
              Полные данные банковской карты пользователя не поступают Оператору
              и не хранятся на сайте «АудиоЛад».
            </p>
          </Section>

          <Section id="section-4" title="4. Цели обработки персональных данных">
            <p className={bodyClassName}>
              Пользователь даёт согласие на обработку персональных данных в
              следующих целях:
            </p>

            <BulletList
              items={[
                "регистрация пользователя на сайте;",
                "создание и обслуживание личного кабинета;",
                "идентификация пользователя при входе в личный кабинет;",
                "восстановление доступа к учётной записи;",
                "оформление и обработка заказов;",
                "заключение и исполнение договора купли-продажи цифровых аудиопродуктов;",
                "предоставление доступа к приобретённым цифровым аудиопродуктам;",
                "ведение истории покупок и предоставленных доступов;",
                "проведение платежей и подтверждение оплаты;",
                "направление служебных уведомлений, связанных с регистрацией, безопасностью, покупками и доступом к продуктам;",
                "рассмотрение обращений и предоставление технической поддержки;",
                "предотвращение мошенничества и неправомерного доступа;",
                "обеспечение корректной и безопасной работы сайта;",
                "исполнение требований бухгалтерского, налогового и иного законодательства Российской Федерации;",
                "защита прав и законных интересов Оператора и пользователей сайта.",
              ]}
            />
          </Section>

          <Section id="section-5" title="5. Действия с персональными данными">
            <p className={bodyClassName}>
              Пользователь даёт согласие на совершение следующих действий с
              персональными данными:
            </p>

            <BulletList
              items={[
                "сбор;",
                "запись;",
                "систематизация;",
                "накопление;",
                "хранение;",
                "уточнение и обновление;",
                "изменение;",
                "извлечение;",
                "использование;",
                "предоставление доступа;",
                "передача в случаях, предусмотренных настоящим Согласием и законодательством Российской Федерации;",
                "обезличивание;",
                "блокирование;",
                "удаление;",
                "уничтожение.",
              ]}
            />

            <p className={bodyClassName}>
              Обработка персональных данных может осуществляться как с
              использованием средств автоматизации, так и без их использования.
            </p>
          </Section>

          <Section id="section-6" title="6. Использование электронной почты">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">6.1.</strong>{" "}
              Оператор вправе использовать адрес электронной почты пользователя
              для направления служебных сообщений, необходимых для работы сайта
              и исполнения договора, включая:
            </p>

            <BulletList
              items={[
                "подтверждение регистрации;",
                "восстановление доступа;",
                "уведомления о безопасности учётной записи;",
                "подтверждение заказа и оплаты;",
                "информацию о предоставлении доступа к продукту;",
                "ответы на обращения пользователя;",
                "сообщения об изменениях, непосредственно влияющих на использование приобретённых продуктов или личного кабинета.",
              ]}
            />

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">6.2.</strong>{" "}
              Настоящее Согласие не является согласием на получение рекламных и
              маркетинговых рассылок.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">6.3.</strong> Для
              направления рекламных, информационных и маркетинговых сообщений
              Оператор должен получить отдельное согласие пользователя, если
              такое согласие требуется законодательством Российской Федерации.
            </p>
          </Section>

          <Section
            id="section-7"
            title="7. Передача и поручение обработки данных"
          >
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">7.1.</strong>{" "}
              Оператор вправе поручать обработку персональных данных другим лицам
              и предоставлять им доступ к данным только в объёме, необходимом для
              работы сайта, исполнения договора и соблюдения законодательства.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">7.2.</strong>{" "}
              Обработка персональных данных может быть поручена:
            </p>

            <BulletList
              items={[
                "ООО «ТАЙМВЭБ.КЛАУД» – для размещения сайта, баз данных, файлов и обеспечения работы серверной инфраструктуры;",
                "ООО «Банк Точка» – для проведения платежей посредством интернет-эквайринга;",
                "иным техническим исполнителям, если их участие необходимо для функционирования сайта и исполнения обязательств перед пользователем.",
              ]}
            />

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">7.3.</strong>{" "}
              Указанные лица обязаны обеспечивать конфиденциальность и
              безопасность персональных данных и обрабатывать их только в рамках
              поручения Оператора либо на иных законных основаниях.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">7.4.</strong>{" "}
              Передача персональных данных государственным органам допускается
              в случаях и порядке, предусмотренных законодательством Российской
              Федерации.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">7.5.</strong>{" "}
              Оператор не продаёт персональные данные пользователей и не
              передаёт их третьим лицам для самостоятельного рекламного
              использования.
            </p>
          </Section>

          <Section id="section-8" title="8. Платёжные данные">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">8.1.</strong>{" "}
              Оплата цифровых аудиопродуктов осуществляется на защищённой
              странице платёжного сервиса ООО «Банк Точка».
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">8.2.</strong>{" "}
              Пользователь самостоятельно передаёт платёжному сервису сведения,
              необходимые для совершения платежа.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">8.3.</strong>{" "}
              Оператор может получать от платёжного сервиса только сведения,
              необходимые для подтверждения и учёта операции, включая:
            </p>

            <BulletList
              items={[
                "идентификатор платежа;",
                "сумму;",
                "дату и время;",
                "статус операции;",
                "сведения о возврате;",
                "иные технические сведения о платеже, не содержащие полных реквизитов банковской карты.",
              ]}
            />

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">8.4.</strong>{" "}
              Полный номер банковской карты, срок её действия и защитный код не
              передаются Оператору и не хранятся на сайте «АудиоЛад».
            </p>
          </Section>

          <Section
            id="section-9"
            title="9. Хранение и защита персональных данных"
          >
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">9.1.</strong>{" "}
              Персональные данные граждан Российской Федерации хранятся с
              использованием баз данных, находящихся на территории Российской
              Федерации.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">9.2.</strong>{" "}
              Оператор принимает необходимые правовые, организационные и
              технические меры для защиты персональных данных от:
            </p>

            <BulletList
              items={[
                "неправомерного или случайного доступа;",
                "уничтожения;",
                "изменения;",
                "блокирования;",
                "копирования;",
                "предоставления;",
                "распространения;",
                "иных неправомерных действий.",
              ]}
            />

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">9.3.</strong>{" "}
              Доступ к персональным данным предоставляется только тем лицам,
              которым он необходим для выполнения соответствующих обязанностей.
            </p>
          </Section>

          <Section id="section-10" title="10. Срок действия Согласия">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">10.1.</strong>{" "}
              Настоящее Согласие действует с момента его предоставления
              пользователем.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">10.2.</strong>{" "}
              Согласие действует до наступления одного из следующих событий:
            </p>

            <BulletList
              items={[
                "достижения целей обработки персональных данных;",
                "удаления учётной записи пользователя;",
                "отзыва Согласия пользователем;",
                "прекращения деятельности Оператора;",
                "наступления иных оснований прекращения обработки, предусмотренных законодательством Российской Федерации.",
              ]}
            />

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">10.3.</strong>{" "}
              После прекращения действия Согласия Оператор прекращает обработку
              и уничтожает персональные данные в сроки, установленные
              законодательством Российской Федерации, если их дальнейшее
              хранение не требуется по закону.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">10.4.</strong>{" "}
              Сведения о совершённых покупках, платежах, возвратах,
              бухгалтерском и налоговом учёте могут храниться в течение
              установленных законом сроков независимо от отзыва Согласия.
            </p>
          </Section>

          <Section id="section-11" title="11. Отзыв Согласия">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">11.1.</strong>{" "}
              Пользователь вправе в любой момент отозвать настоящее Согласие.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">11.2.</strong>{" "}
              Для отзыва Согласия пользователь направляет обращение по адресу:{" "}
              <a href="mailto:1@audiolad.ru" className={linkClassName}>
                1@audiolad.ru
              </a>
            </p>

            <p className={bodyClassName}>В обращении необходимо указать:</p>

            <BulletList
              items={[
                "имя или отображаемое имя;",
                "адрес электронной почты, использованный при регистрации;",
                "требование об отзыве согласия на обработку персональных данных.",
              ]}
            />

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">11.3.</strong>{" "}
              Оператор вправе запросить дополнительные сведения, необходимые для
              подтверждения личности заявителя и предотвращения удаления данных
              по обращению постороннего лица.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">11.4.</strong>{" "}
              Отзыв Согласия может повлечь невозможность дальнейшего
              использования личного кабинета и функций сайта, для которых
              необходима обработка персональных данных.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">11.5.</strong>{" "}
              После отзыва Согласия Оператор вправе продолжить обработку
              персональных данных без согласия пользователя при наличии
              оснований, предусмотренных законодательством Российской
              Федерации.
            </p>
          </Section>

          <Section id="section-12" title="12. Способ предоставления Согласия">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">12.1.</strong>{" "}
              Согласие предоставляется пользователем путём самостоятельного
              проставления отметки в соответствующем поле на сайте.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">12.2.</strong>{" "}
              Текст рядом с полем должен содержать ссылку на настоящее Согласие
              и однозначно подтверждать волю пользователя, например:
            </p>

            <blockquote className="border-l-4 border-[#eadff8] bg-[#faf4ff] px-4 py-3 text-[15px] leading-7 text-[#4c3d78] italic">
              Я даю согласие на обработку персональных данных и подтверждаю, что
              ознакомился с Политикой обработки персональных данных.
            </blockquote>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">12.3.</strong>{" "}
              Поле согласия не должно быть отмечено заранее.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">12.4.</strong>{" "}
              Без предоставления Согласия пользователь не может завершить
              регистрацию либо выполнить иное действие, для которого обработка
              персональных данных является необходимой.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">12.5.</strong>{" "}
              Оператор вправе сохранять технические сведения, подтверждающие
              предоставление Согласия, включая:
            </p>

            <BulletList
              items={[
                "дату и время;",
                "версию текста Согласия;",
                "адрес страницы;",
                "IP-адрес;",
                "идентификатор пользователя или сессии;",
                "иные технические сведения, позволяющие подтвердить факт получения Согласия.",
              ]}
            />
          </Section>

          <Section id="section-13" title="13. Заключительные положения">
            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">13.1.</strong>{" "}
              Пользователь подтверждает, что предоставляемые им персональные
              данные являются достоверными и принадлежат ему.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">13.2.</strong>{" "}
              Пользователь обязуется не предоставлять персональные данные третьих
              лиц без наличия законных оснований.
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">13.3.</strong>{" "}
              Вопросы, не урегулированные настоящим Согласием, регулируются
              законодательством Российской Федерации и Политикой обработки
              персональных данных сайта «АудиоЛад».
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">13.4.</strong>{" "}
              Актуальная редакция Политики обработки персональных данных
              размещена по адресу:{" "}
              <a href="/privacy" className={linkClassName}>
                https://audiolad.ru/privacy
              </a>
            </p>

            <p className={bodyClassName}>
              <strong className="font-semibold text-[#25135c]">13.5.</strong>{" "}
              Оператор вправе обновлять текст настоящего Согласия. Новая
              редакция применяется к обработке персональных данных после её
              опубликования и получения согласия пользователя в случаях, когда
              повторное согласие требуется законодательством Российской
              Федерации.
            </p>
          </Section>

          <section className="mt-10" aria-labelledby="section-14">
            <h2 id="section-14" className={sectionTitleClassName}>
              14. Контактная информация Оператора
            </h2>

            <div className="mt-4 overflow-hidden rounded-[22px] border border-[#eadff8] bg-gradient-to-r from-[#faf4ff] to-[#f1e4fc] p-6 lg:p-7">
              <RequisiteItem label="Оператор">
                Индивидуальный предприниматель Петров Сергей Сергеевич
              </RequisiteItem>

              <RequisiteItem label="ИНН">507305817690</RequisiteItem>

              <RequisiteItem label="ОГРНИП">316505300063237</RequisiteItem>

              <RequisiteItem label="Адрес регистрации">
                355045, г. Ставрополь, ул. 45 Параллель, д. 73, кв. 45
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
