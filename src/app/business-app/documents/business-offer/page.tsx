import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";

import SimpleMarkdown from "@/components/legal/SimpleMarkdown";
import { BUSINESS_OFFER_SOURCE } from "@/lib/business-app/business-offer-content";
import { businessOfferAnnexes } from "@/lib/business-app/business-offer-annexes";
import { CLIENT_DOCUMENT_EDITION_LABEL, CLIENT_DOCUMENT_REQUISITES } from "@/lib/business-app/client-documents";
import { getHostnameFromHeaders } from "@/lib/business-app/host";
import { buildCoffeePublicPageMetadata } from "@/lib/business-app/seo";
import { BUSINESS_OFFER_EDITION, BUSINESS_OFFER_HREF, BUSINESS_OFFER_TITLE } from "@/lib/business/offer";

export const dynamic = "force-dynamic";

const DESCRIPTION = "Договор-оферта сервиса «АудиоЛад Бизнес»: 7 дней в подарок, 799 ₽ за точку на 30 дней, разовые оплаты, продление и возврат.";

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
  const annexes = businessOfferAnnexes();
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
      <section className="business-app-card" aria-labelledby="business-offer-annexes" data-testid="business-offer-annexes">
        <h2 id="business-offer-annexes" className="text-lg font-bold text-[var(--biz-text)]">Приложения к договору</h2>
        <ol className="mt-3 space-y-2 text-sm leading-6">
          {annexes.map((annex) => (
            <li key={annex.id} data-testid={`business-offer-annex-${annex.id}`}>
              Приложение {annex.number} –{" "}
              <Link href={annex.href} className="font-semibold text-[var(--biz-accent)] underline underline-offset-2">
                «{annex.title}»
              </Link>
              . {CLIENT_DOCUMENT_EDITION_LABEL}.
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
