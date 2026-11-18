import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import BusinessLegalShell, {
  LegalTable,
  legalBodyClass,
  legalCardClass,
  legalBadgeClass,
  legalH2Class,
  legalLinkClass,
} from "@/components/business/legal/BusinessLegalShell";
import {
  BUSINESS_LEGAL_CERTIFICATE_HREF,
  BUSINESS_LEGAL_RIGHTS_HREF,
  BUSINESS_LEGAL_ROBOTS,
  findBusinessLegalCertificate,
} from "@/lib/business/legal/section";

type Props = { params: Promise<{ number: string }> };

export const metadata: Metadata = {
  title: "Проверка сертификата – АудиоЛад Бизнес",
  robots: BUSINESS_LEGAL_ROBOTS,
};

export default async function BusinessLegalCertificateCheckPage({ params }: Props) {
  const { number } = await params;
  const certificate = findBusinessLegalCertificate(number);
  if (!certificate) notFound();

  return (
    <BusinessLegalShell
      kicker="Проверка сертификата"
      breadcrumb="Проверка сертификата"
      title={`Сертификат № ${certificate.number}`}
      lead="Страница открывается по QR-коду из сертификата и показывает, подлинный ли документ и действует ли он сегодня."
    >
      <section className={legalCardClass}>
        <p>
          <span className={legalBadgeClass}>
            Образец – данные вымышлены
          </span>
        </p>
        <LegalTable
          rows={[
            ["Номер", certificate.number],
            ["Выдан", certificate.issuedAt],
            ["Действует по", certificate.validUntil],
            ["Лицензиат", certificate.licensee],
            ["Точка", certificate.venue],
            ["Адрес", certificate.venueAddress],
            ["Каталог", certificate.catalog],
            ["Лицензиар", "ИП Петров Сергей Сергеевич"],
          ]}
        />
        <p className={"mt-4 " + legalBodyClass}>
          У настоящего сертификата здесь показаны статус и срок действия. Сверьте номер и
          адрес с распечаткой. Электронная почта, телефоны и другие личные данные на этой странице не показываются.
        </p>
      </section>
      <section className={legalCardClass}>
        <h2 className={legalH2Class}>Что это значит</h2>
        <p className={"mt-4 " + legalBodyClass}>
          Точка подключена к «АудиоЛад Бизнес» и имеет право включать музыку каталога через плеер сервиса до
          указанной даты. Как устроены права – в разделе{" "}
          <Link href={BUSINESS_LEGAL_RIGHTS_HREF} className={legalLinkClass}>
            «Как устроены права на музыку»
          </Link>
          , о сертификате –{" "}
          <Link href={BUSINESS_LEGAL_CERTIFICATE_HREF} className={legalLinkClass}>
            «Сертификат на точку»
          </Link>
          .
        </p>
      </section>
    </BusinessLegalShell>
  );
}
