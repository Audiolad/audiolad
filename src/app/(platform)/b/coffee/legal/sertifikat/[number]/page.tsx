import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import BusinessLegalShell, {
  LegalTable,
  legalBodyClass,
  legalCardClass,
  legalBadgeClass,
  legalH2Class,
  legalDocLinkProps,
  legalLinkClass,
} from "@/components/business/legal/BusinessLegalShell";
import {
  BUSINESS_CERTIFICATE_CATALOG,
  BUSINESS_CERTIFICATE_GENERATORS,
  basisLine,
  certificateDisplayNumber,
  certificateStatusLabel,
  moscowDate,
  ogrnLabel,
  periodLine,
} from "@/lib/business/legal/certificate";
import { loadCertificateCheck, type CertificateCheck } from "@/lib/business/legal/certificate.server";
import {
  BUSINESS_LEGAL_CERTIFICATE_HREF,
  BUSINESS_LEGAL_OFFER_HREF,
  BUSINESS_LEGAL_OPERATOR,
  BUSINESS_LEGAL_RIGHTS_HREF,
  BUSINESS_LEGAL_ROBOTS,
  BUSINESS_LEGAL_SAMPLE_CERTIFICATE,
  businessLegalCertificateHref,
  normalizeBusinessLegalCertificateNumber,
} from "@/lib/business/legal/section";

type Props = { params: Promise<{ number: string }> };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Проверка сертификата – АудиоЛад Кофейня",
  robots: BUSINESS_LEGAL_ROBOTS,
};

function SampleCheck() {
  const certificate = BUSINESS_LEGAL_SAMPLE_CERTIFICATE;
  return (
    <section className={legalCardClass}>
      <p>
        <span className={legalBadgeClass}>Образец – данные вымышлены</span>
      </p>
      <LegalTable
        rows={[
          ["Номер", certificate.number],
          ["Выдан", certificate.issuedAt],
          ["Действует по", certificate.validUntil],
          ["Лицензиат", certificate.licensee],
          ["Заведение", certificate.venue],
          ["Адрес", certificate.venueAddress],
          ["Каталог", certificate.catalog],
          ["Лицензиар", "ИП Петров Сергей Сергеевич"],
        ]}
      />
      <p className={"mt-4 " + legalBodyClass}>
        У настоящего сертификата здесь показаны статус и срок действия. Сверьте номер и адрес с распечаткой.
        Электронная почта, телефоны и другие личные данные на этой странице не показываются.
      </p>
    </section>
  );
}

/** Follows «заменён» to the point's current certificate (at most a few hops). */
async function currentOf(check: CertificateCheck): Promise<CertificateCheck | null> {
  let cur: CertificateCheck | null = check;
  for (let hop = 0; hop < 20 && cur && cur.status === "superseded" && cur.supersededByNumber; hop += 1) {
    cur = await loadCertificateCheck(cur.supersededByNumber);
  }
  return cur && cur !== check ? cur : null;
}

export default async function BusinessLegalCertificateCheckPage({ params }: Props) {
  const { number: raw } = await params;
  const number = normalizeBusinessLegalCertificateNumber(raw);
  if (!number) notFound();
  const isSample = number === BUSINESS_LEGAL_SAMPLE_CERTIFICATE.urlNumber;
  const check = isSample ? null : await loadCertificateCheck(number);
  if (!isSample && !check) notFound();
  const current = check && check.status === "superseded" ? await currentOf(check) : null;

  return (
    <BusinessLegalShell
      kicker="Проверка сертификата"
      breadcrumb="Проверка сертификата"
      title={`Сертификат № ${isSample ? BUSINESS_LEGAL_SAMPLE_CERTIFICATE.number : certificateDisplayNumber(number)}`}
      lead="Страница открывается по QR-коду из сертификата и показывает, подлинный ли документ и действует ли он сегодня."
    >
      {isSample || !check ? (
        <SampleCheck />
      ) : (
        <section className={legalCardClass} data-testid="certificate-check" data-status={check.status}>
          <p>
            <span className={legalBadgeClass + (check.status === "valid" ? " business-legal__badge--ok" : " business-legal__badge--warn")}>
              {certificateStatusLabel(check.status)}
            </span>
          </p>
          {check.status === "superseded" && current ? (
            <p className={"mt-3 " + legalBodyClass}>
              Сертификат подлинный, но после изменения данных заведения выдан новый:{" "}
              <Link href={businessLegalCertificateHref(current.number)} className={legalLinkClass} {...legalDocLinkProps}>
                № {certificateDisplayNumber(current.number)}
              </Link>{" "}
              – {certificateStatusLabel(current.status).toLowerCase()}
              {current.status === "valid" ? `, по ${moscowDate(current.validUntil)}` : ""}.
            </p>
          ) : null}
          <LegalTable
            rows={[
              ["Номер", certificateDisplayNumber(check.number)],
              ["Статус", certificateStatusLabel(check.status)],
              ["Выдан", moscowDate(check.issuedAt) ?? ""],
              [check.status === "valid" ? "Действует по" : "Срок в сертификате", moscowDate(check.validUntil) ?? ""],
              ["Заведение", check.snapshot.venueName],
              ["Адрес заведения", check.snapshot.venueAddress],
              ["Лицензиат", check.snapshot.licensee.name],
              [`ИНН / ${ogrnLabel(check.snapshot.licensee.kind)}`, `${check.snapshot.licensee.inn} / ${check.snapshot.licensee.ogrn}`],
              ["Срок доступа в сертификате", periodLine(check.snapshot)],
              ["Каталог", BUSINESS_CERTIFICATE_CATALOG],
              ["Создание музыки", BUSINESS_CERTIFICATE_GENERATORS],
              ["Лицензиар", `${BUSINESS_LEGAL_OPERATOR.name}, ИНН ${BUSINESS_LEGAL_OPERATOR.inn}, ОГРНИП ${BUSINESS_LEGAL_OPERATOR.ogrnip}`],
              ["Основание", basisLine(check.snapshot)],
            ]}
          />
          <p className={"mt-4 " + legalBodyClass}>
            Данные на этой странице главнее распечатки: например, после продления доступа срок здесь позже. Электронная
            почта, телефоны и другие личные данные на этой странице не показываются.
          </p>
        </section>
      )}
      <section className={legalCardClass}>
        <h2 className={legalH2Class}>Что это значит</h2>
        <p className={"mt-4 " + legalBodyClass}>
          Если статус «Действует», точка подключена к «АудиоЛад Кофейня» и имеет право включать музыку каталога через
          плеер сервиса до указанной даты. Права на фонограммы каталога лицензиат получает напрямую от их изготовителя и
          правообладателя. Как устроены права – в разделе{" "}
          <Link href={BUSINESS_LEGAL_RIGHTS_HREF} className={legalLinkClass} {...legalDocLinkProps}>
            «Как устроены права на музыку»
          </Link>
          , о сертификате –{" "}
          <Link href={BUSINESS_LEGAL_CERTIFICATE_HREF} className={legalLinkClass} {...legalDocLinkProps}>
            «Сертификат на точку»
          </Link>
          , условия – в{" "}
          <Link href={BUSINESS_LEGAL_OFFER_HREF} className={legalLinkClass} {...legalDocLinkProps}>
            договоре-оферте
          </Link>
          .
        </p>
      </section>
    </BusinessLegalShell>
  );
}
