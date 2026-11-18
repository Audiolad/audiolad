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
  title: "Сертификат на точку – АудиоЛад Бизнес",
  description: "Сертификат на каждую точку: что в нём указано и как проверить подлинность по QR-коду.",
  robots: BUSINESS_LEGAL_ROBOTS,
};

export default function BusinessLegalCertificatePage() {
  return (
    <BusinessLegalShell
      kicker="Правовая информация"
      breadcrumb="Сертификат на точку"
      title="Сертификат на точку"
      lead="У каждой подключённой точки – свой сертификат. Его подлинность проверяется по QR-коду на audiolad.ru, подпись на бумаге не нужна."
    >
      <section className={legalCardClass}>
        <h2 className={legalH2Class}>Что указано в сертификате</h2>
        <LegalTable
          rows={[
            ["Номер и даты", "Номер сертификата, дата выдачи и срок действия"],
            ["Лицензиар", "ИП Петров Сергей Сергеевич – изготовитель и правообладатель фонограмм"],
            [
              "Лицензиат",
              "Организация или ИП по ИНН: название, ОГРН или ОГРНИП и юридический адрес – из государственного реестра",
            ],
            ["Точка", "Одна точка: название и адрес – как в кабинете, адрес обязателен"],
            ["Срок", "Период доступа: подарочный или оплаченный"],
            [
              "Основание",
              `Договор-оферта «АудиоЛад Бизнес» в редакции от ${BUSINESS_LEGAL_OFFER_EDITION} и дата её принятия владельцем`,
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
        <p className={"mt-4 " + legalBodyClass}>Пример сертификата для одной точки, данные вымышлены:</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BUSINESS_LEGAL_SAMPLE_PNG}
          alt="Образец сертификата точки"
          width={1191}
          height={1685}
          loading="lazy"
          className={legalSampleClass}
        />
        <a
          href={BUSINESS_LEGAL_SAMPLE_PDF}
          className={legalButtonClass}
        >
          Открыть образец PDF
        </a>
      </section>

      <section className={legalCardClass}>
        <h2 className={legalH2Class}>Почему у каждой точки свой</h2>
        <div className={"mt-4 space-y-4 " + legalBodyClass}>
          <p>
            Проверяющий приходит в конкретный зал. Поэтому в сертификате только эта точка и её адрес – ничего не
            нужно искать в списке.
          </p>
          <p>
            Если у владельца несколько точек, у каждой свой номер. Новая точка получает сертификат, когда её
            добавляют в кабинет и у неё указан адрес.
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
              text: "с номером сертификата, точкой, адресом и статусом.",
            },
            {
              title: "Сверьте данные.",
              text: "Если они совпадают и статус «Действует» – сертификат подлинный и действует сегодня.",
            },
          ]}
        />
        <p className={"mt-5 " + legalBodyClass}>
          <Link href={businessLegalCertificateHref(BUSINESS_LEGAL_SAMPLE_CERTIFICATE.urlNumber)} className={legalLinkClass}>
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
          Кабинет → «Документы» → «Сертификат точки». У каждой точки – своя карточка: скачать PDF или показать на
          экране.
        </p>
        <p className={"mt-4 " + legalBodyClass}>
          Новый сертификат формируется сам при новом периоде доступа, при смене адреса точки или ИНН и при новой
          редакции договора.
        </p>
        <h3 className={legalH3Class}>Что нужно ввести владельцу</h3>
        <p className={"mt-3 " + legalBodyClass}>
          Только две вещи: ИНН организации или ИП и адрес каждой точки. Название, ОГРН или ОГРНИП и юридический
          адрес подставляются сами из государственного реестра по ИНН. Без ИНН и адреса точки сертификат не
          формируется.
        </p>
      </section>
    </BusinessLegalShell>
  );
}
