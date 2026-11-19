import type { Metadata } from "next";
import Link from "next/link";

import BusinessLegalShell, {
  LegalSteps,
  LegalTable,
  legalBodyClass,
  legalCardClass,
  legalH2Class,
  legalButtonClass,
  legalH3Class,
  legalDocLinkProps,
  legalLinkClass,
  legalSampleClass,
} from "@/components/business/legal/BusinessLegalShell";
import {
  BUSINESS_LEGAL_OFFER_EDITION,
  BUSINESS_LEGAL_ROBOTS,
  BUSINESS_LEGAL_SAMPLE_CERTIFICATE,
  BUSINESS_LEGAL_SAMPLE_PDF,
  BUSINESS_LEGAL_SAMPLE_PNG,
  businessLegalCertificateHref,
} from "@/lib/business/legal/section";

export const metadata: Metadata = {
  title: "Сертификат на заведение – АудиоЛад Кофейня",
  description: "Сертификат на каждое заведение: что в нём указано и как проверить подлинность по QR-коду.",
  robots: BUSINESS_LEGAL_ROBOTS,
};

export default function BusinessLegalCertificatePage() {
  return (
    <BusinessLegalShell
      kicker="Правовая информация"
      breadcrumb="Сертификат на заведение"
      title="Сертификат на заведение"
      lead="У каждого подключённого заведения – свой сертификат. Его подлинность проверяется по QR-коду на audiolad.ru, подпись на бумаге не нужна."
    >
      <section className={legalCardClass}>
        <h2 className={legalH2Class}>Что указано в сертификате</h2>
        <LegalTable
          rows={[
            ["Номер и даты", "Номер сертификата, дата выдачи и срок действия"],
            ["Лицензиар", "ИП Петров Сергей Сергеевич – изготовитель и правообладатель фонограмм"],
            [
              "Лицензиат",
              "Организация или ИП по ИНН: название и ОГРН или ОГРНИП – из государственного реестра (ЕГРЮЛ или ЕГРИП)",
            ],
            ["Заведение", "Одно заведение: название и адрес – как в кабинете, адрес обязателен"],
            ["Срок", "Период доступа: подарочный или оплаченный"],
            ["Каталог", "Каталог «АудиоЛад Кофейня»: музыка создана с помощью MusicGPT и других сервисов генерации музыки"],
            [
              "Основание",
              `Договор-оферта «АудиоЛад Кофейня» в редакции от ${BUSINESS_LEGAL_OFFER_EDITION} и дата её принятия владельцем`,
            ],
            ["Проверка", "QR-код со ссылкой на страницу проверки на audiolad.ru"],
          ]}
        />
        <p className={"mt-4 " + legalBodyClass}>
          Сертификат подтверждает договор с сервисом и право использовать фонограммы каталога в пределах лицензии.
          Он не является государственной регистрацией прав.
        </p>
      </section>

      <section className={legalCardClass}>
        <h2 className={legalH2Class}>Образец</h2>
        <p className={"mt-4 " + legalBodyClass}>Пример сертификата для одного заведения, данные вымышлены:</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BUSINESS_LEGAL_SAMPLE_PNG}
          alt="Образец сертификата заведения"
          width={1192}
          height={1628}
          loading="lazy"
          className={legalSampleClass}
        />
        <a
          href={BUSINESS_LEGAL_SAMPLE_PDF}
          className={legalButtonClass}
          {...legalDocLinkProps}
        >
          Открыть образец PDF
        </a>
      </section>

      <section className={legalCardClass}>
        <h2 className={legalH2Class}>Почему у каждого заведения свой</h2>
        <div className={"mt-4 space-y-4 " + legalBodyClass}>
          <p>
            Проверяющий приходит в конкретный зал. Поэтому в сертификате только это заведение и его адрес – ничего не
            нужно искать в списке.
          </p>
          <p>
            Если у владельца несколько заведений, у каждого свой номер. Новое заведение получает сертификат, когда его
            добавляют в кабинет и у него указан адрес.
          </p>
        </div>
      </section>

      <section className={legalCardClass}>
        <h2 className={legalH2Class}>Как проверить подлинность</h2>
        <LegalSteps
          items={[
            { title: "Наведите камеру телефона", text: "на QR-код в сертификате." },
            {
              title: "Откроется страница на audiolad.ru",
              text: "с номером сертификата, заведением, адресом и статусом.",
            },
            {
              title: "Сверьте данные.",
              text: "Если они совпадают и статус «Действует» – сертификат подлинный и действует сегодня.",
            },
          ]}
        />
        <p className={"mt-5 " + legalBodyClass}>
          <Link href={businessLegalCertificateHref(BUSINESS_LEGAL_SAMPLE_CERTIFICATE.urlNumber)} className={legalLinkClass} {...legalDocLinkProps}>
            Как выглядит страница проверки
          </Link>
        </p>
        <p className={"mt-4 " + legalBodyClass}>
          Если данные на странице и в распечатке различаются, верны данные страницы: например, после продления
          срока.
        </p>
      </section>

      <section className={legalCardClass}>
        <h2 className={legalH2Class}>Где получить</h2>
        <p className={"mt-4 " + legalBodyClass}>
          Кабинет → «Документы» → «Сертификат заведения». У каждого заведения – своя карточка: скачать PDF или показать на
          экране.
        </p>
        <p className={"mt-4 " + legalBodyClass}>
          Там же – QR-наклейка 80×80 мм и настольная табличка А6 для печати. Проверяющему можно показать сертификат или
          QR-код прямо с телефона.
        </p>
        <p className={"mt-4 " + legalBodyClass}>
          Новый сертификат формируется сам при новом периоде доступа, при смене адреса заведения или ИНН и при новой
          редакции договора.
        </p>
        <h3 className={legalH3Class}>Что нужно ввести владельцу</h3>
        <p className={"mt-3 " + legalBodyClass}>
          Только две вещи: ИНН организации или ИП и адрес каждого заведения. Название и ОГРН или ОГРНИП подставляются
          сами из государственного реестра по ИНН. Без ИНН и адреса заведения сертификат не формируется. Ещё нужны
          принятая действующая редакция договора и идущий подарочный или оплаченный период.
        </p>
      </section>
    </BusinessLegalShell>
  );
}
