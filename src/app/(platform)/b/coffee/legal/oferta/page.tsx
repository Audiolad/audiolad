import type { Metadata } from "next";

import BusinessLegalShell, {
  legalBodyClass,
  legalButtonClass,
  legalCardClass,
  legalDocLinkProps,
} from "@/components/business/legal/BusinessLegalShell";
import SimpleMarkdown from "@/components/legal/SimpleMarkdown";
import { BUSINESS_OFFER_SOURCE } from "@/lib/business-app/business-offer-content";
import { BUSINESS_OFFER_EDITION } from "@/lib/business/offer";
import {
  BUSINESS_LEGAL_OFFER_DOCX_PATH,
  BUSINESS_LEGAL_OFFER_PDF_PATH,
  BUSINESS_LEGAL_ROBOTS,
} from "@/lib/business/legal/section";

export const metadata: Metadata = {
  title: "Договор-оферта – АудиоЛад Кофейня",
  description: "Договор-оферта «АудиоЛад Кофейня» с приложениями: лицензия, сертификат точки, защита заведения.",
  robots: BUSINESS_LEGAL_ROBOTS,
};

/** Принятый текст как есть: первая строка «# …» – заголовок страницы, остальное без изменений. */
function bodyWithoutTitle(markdown: string): string {
  return markdown.replace(/^# [^\n]*\n+/, "");
}

export default function BusinessLegalOfferPage() {
  return (
    <BusinessLegalShell
      kicker="Правовая информация"
      breadcrumb="Договор-оферта"
      title="Договор-оферта «АудиоЛад Кофейня»"
      lead={`${BUSINESS_OFFER_EDITION.label}. Принимается в личном кабинете один раз – для всей учётной записи и всех точек. Приложения 1–4 – часть договора.`}
    >
      <section className={legalCardClass}>
        <p className={legalBodyClass}>Тот же текст для печати:</p>
        <p className="business-legal__actions">
          <a href={BUSINESS_LEGAL_OFFER_PDF_PATH} className={legalButtonClass} {...legalDocLinkProps}>
            Скачать PDF
          </a>{" "}
          <a href={BUSINESS_LEGAL_OFFER_DOCX_PATH} className={legalButtonClass} {...legalDocLinkProps}>
            Скачать DOCX
          </a>
        </p>
      </section>
      <section
        className={legalCardClass + " business-legal__offer"}
        data-document-id={BUSINESS_OFFER_EDITION.documentKey}
        data-document-version={BUSINESS_OFFER_SOURCE.version}
        data-document-sha256={BUSINESS_OFFER_SOURCE.sha256}
      >
        <SimpleMarkdown source={bodyWithoutTitle(BUSINESS_OFFER_SOURCE.markdown)} />
      </section>
    </BusinessLegalShell>
  );
}
