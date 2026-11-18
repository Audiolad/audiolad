import Link from "next/link";

import BusinessLegalShell, { legalBodyClass, legalCardClass, legalLinkClass } from "@/components/business/legal/BusinessLegalShell";
import { BUSINESS_LEGAL_CERTIFICATE_HREF } from "@/lib/business/legal/section";

export default function BusinessLegalCertificateNotFound() {
  return (
    <BusinessLegalShell
      kicker="Проверка сертификата"
      breadcrumb="Проверка сертификата"
      title="Сертификат не найден"
      lead="Сертификата с таким номером нет."
    >
      <section className={legalCardClass}>
        <p className={legalBodyClass}>
          Проверьте номер: он указан в сертификате рядом с датой выдачи. Удобнее всего открыть эту страницу по
          QR-коду. Как устроен сертификат – на странице{" "}
          <Link href={BUSINESS_LEGAL_CERTIFICATE_HREF} className={legalLinkClass}>
            «Сертификат на точку»
          </Link>
          .
        </p>
      </section>
    </BusinessLegalShell>
  );
}
