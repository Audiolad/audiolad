import type { Metadata } from "next";
import Link from "next/link";

import CertificatePrintButton from "@/components/business-app/legal/CertificatePrintButton";
import VenueCertificateDocument from "@/components/business/legal/VenueCertificateDocument";
import "@/components/business/legal/venue-certificate.css";
import { BUSINESS_CERTIFICATE_MISSING_TEXT, certificateCheckUrl } from "@/lib/business/legal/certificate";
import { loadCabinetCertificateContext } from "@/lib/business/legal/certificate-context.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Сертификат заведения – АудиоЛад Кофейня",
  robots: { index: false, follow: false },
};

/** Сертификат точки владельца (или точки, к которой привязано устройство зала): экран и PDF. */
export default async function BusinessCertificatePage() {
  const context = await loadCabinetCertificateContext();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="venue-cert-noprint flex flex-wrap items-center justify-between gap-3">
        <Link href="/documents#sertifikat" className="text-sm text-[var(--biz-accent)]">Все документы</Link>
        {context.kind === "ready" && context.state.kind === "issued" ? <CertificatePrintButton /> : null}
      </div>
      {context.kind === "ready" && context.state.kind === "issued" ? (
        <>
          <div className="venue-cert-print">
            <VenueCertificateDocument number={context.state.number} issuedAt={context.state.issuedAt} snapshot={context.state.snapshot} />
          </div>
          <p className="venue-cert-noprint text-sm leading-6 text-[var(--biz-text-muted)]">
            Проверяющему можно показать этот экран или распечатку. Страница проверки:{" "}
            <a target="_blank" rel="noopener noreferrer" href={certificateCheckUrl(context.state.number)} className="font-semibold text-[var(--biz-accent)] underline underline-offset-2">
              открыть
            </a>
            . Чтобы сохранить PDF, нажмите «Скачать PDF или распечатать» и выберите «Сохранить как PDF».
          </p>
        </>
      ) : (
        <section className="business-app-card space-y-3" data-testid="biz-certificate-not-ready">
          <h1 className="text-[1.3rem] font-bold text-[var(--biz-text)]">Сертификат заведения</h1>
          {context.kind === "ready" && context.state.kind === "missing" ? (
            <ul className="space-y-1 text-sm leading-6">
              {context.state.missing.map((m) => (
                <li key={m}>• {BUSINESS_CERTIFICATE_MISSING_TEXT[m]}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">Сначала войдите в кабинет и добавьте кофейню.</p>
          )}
          <Link href="/documents#sertifikat" className="business-app-btn business-app-btn-cta business-app-focus-ring">
            Заполнить данные
          </Link>
        </section>
      )}
    </div>
  );
}
