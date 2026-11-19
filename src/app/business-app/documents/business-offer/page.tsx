import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";

import SimpleMarkdown from "@/components/legal/SimpleMarkdown";
import { BUSINESS_OFFER_SOURCE } from "@/lib/business-app/business-offer-content";
import { CLIENT_DOCUMENT_REQUISITES } from "@/lib/business-app/client-documents";
import {
  BUSINESS_LEGAL_HREF,
  BUSINESS_LEGAL_OFFER_DOCX_PATH,
  BUSINESS_LEGAL_OFFER_PDF,
  businessLegalAbsoluteUrl,
} from "@/lib/business/legal/section";
import { getHostnameFromHeaders } from "@/lib/business-app/host";
import { buildCoffeePublicPageMetadata } from "@/lib/business-app/seo";
import { BUSINESS_OFFER_EDITION, BUSINESS_OFFER_HREF, BUSINESS_OFFER_TITLE } from "@/lib/business/offer";

export const dynamic = "force-dynamic";

const DESCRIPTION = "Договор-оферта «АудиоЛад Кофейня» с приложениями: 7 дней в подарок, оплата, продление и возврат, лицензия, сертификат заведения и защита заведения. Стоимость доступа к сервису фоновой музыки АудиоЛад для одного заведения на 30 дней – по действующему тарифу, который показан в личном кабинете до оплаты.";

export async function generateMetadata(): Promise<Metadata> {
  const title = `${BUSINESS_OFFER_TITLE} – ${BUSINESS_OFFER_EDITION.label}`;
  return {
    title,
    robots: { index: false, follow: false },
    ...buildCoffeePublicPageMetadata(getHostnameFromHeaders(await headers()), BUSINESS_OFFER_HREF, title, DESCRIPTION),
  };
}

/** The first «# title» line is the page heading below; the rest is the accepted text as written. */
function bodyWithoutTitle(markdown: string): string {
  return markdown.replace(/^# [^\n]*\n+/, "");
}

export default function BusinessOfferPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <article
        className="business-app-card"
        data-document-id={BUSINESS_OFFER_EDITION.documentKey}
        data-document-version={BUSINESS_OFFER_SOURCE.version}
        data-document-sha256={BUSINESS_OFFER_SOURCE.sha256}
      >
        <Link href="/documents" className="text-sm text-[var(--biz-accent)]">Все документы</Link>
        <h1 className="mt-3 text-[1.45rem] font-bold tracking-tight text-[var(--biz-text)]">{BUSINESS_OFFER_TITLE}</h1>
        <p className="mt-2 text-sm text-[var(--biz-text-muted)]" data-testid="document-edition">
          {BUSINESS_OFFER_EDITION.label}
        </p>
        <p className="mt-1 text-sm text-[var(--biz-text-muted)]" data-testid="document-requisites">
          {CLIENT_DOCUMENT_REQUISITES}
        </p>
        <div className="business-app-prose">
          <SimpleMarkdown source={bodyWithoutTitle(BUSINESS_OFFER_SOURCE.markdown)} />
        </div>
      </article>
      <section className="business-app-card" aria-labelledby="business-offer-files" data-testid="business-offer-files">
        <h2 id="business-offer-files" className="text-lg font-bold text-[var(--biz-text)]">Для печати</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--biz-text-muted)]">
          Тот же текст с приложениями 1–4. Подписывать не нужно: договор принимается в кабинете.
        </p>
        <p className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
          <a target="_blank" rel="noopener noreferrer" href={BUSINESS_LEGAL_OFFER_PDF} className="text-[var(--biz-accent)] underline underline-offset-2" data-testid="business-offer-pdf">
            Скачать PDF
          </a>
          <a target="_blank" rel="noopener noreferrer" href={businessLegalAbsoluteUrl(BUSINESS_LEGAL_OFFER_DOCX_PATH)} className="text-[var(--biz-accent)] underline underline-offset-2" data-testid="business-offer-docx">
            Скачать DOCX
          </a>
          <a target="_blank" rel="noopener noreferrer" href={businessLegalAbsoluteUrl(BUSINESS_LEGAL_HREF)} className="text-[var(--biz-accent)] underline underline-offset-2" data-testid="business-offer-legal-section">
            Правовая информация
          </a>
        </p>
      </section>
    </div>
  );
}
