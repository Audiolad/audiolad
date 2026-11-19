import Link from "next/link";

import BusinessLegalIdentityForm from "@/components/business-app/legal/BusinessLegalIdentityForm";
import BusinessOfferReacceptPrompt from "@/components/business-app/legal/BusinessOfferReacceptPrompt";
import { BUSINESS_CERTIFICATE_MISSING_TEXT, certificateDisplayNumber } from "@/lib/business/legal/certificate";
import type { CabinetCertificateContext } from "@/lib/business/legal/certificate-context.server";

export const BUSINESS_CERTIFICATE_CABINET_HREF = "/documents/sertifikat";

/** «Сертификат заведения» на странице «Документы»: что заполнить и ссылка на готовый сертификат. */
export default function BusinessCertificateSetup({ context }: { context: CabinetCertificateContext }) {
  if (context.kind !== "ready") return null;
  const { state } = context;
  const identity = state.identity
    ? { inn: state.identity.inn, kind: state.identity.kind, name: state.identity.name, ogrn: state.identity.ogrn }
    : null;
  const missing = state.kind === "missing" ? state.missing : [];
  return (
    <>
      {context.offerPrompt ? <BusinessOfferReacceptPrompt newEdition={context.offerPrompt.newEdition} /> : null}
      <section className="business-app-card space-y-4" id="sertifikat" data-testid="biz-certificate-setup">
        <h2 className="text-[1.2rem] font-bold text-[var(--biz-text)]">Сертификат заведения</h2>
        <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
          Документ для проверяющих: право на музыку в этом заведении, ИНН и адрес. Подлинность проверяется по QR-коду на
          нашем сайте, подпись и печать не нужны.
        </p>

        {state.kind === "issued" ? (
          <div className="space-y-2" data-testid="biz-certificate-ready">
            <p className="text-sm font-semibold text-[var(--biz-text)]">
              Сертификат № {certificateDisplayNumber(state.number)} готов.
            </p>
            <Link href={BUSINESS_CERTIFICATE_CABINET_HREF} className="business-app-btn business-app-btn-cta business-app-focus-ring" data-testid="biz-certificate-open">
              Открыть сертификат
            </Link>
          </div>
        ) : (
          <ul className="space-y-1 text-sm leading-6 text-[var(--biz-text)]" data-testid="biz-certificate-missing">
            {missing.map((m) => (
              <li key={m} data-missing={m}>• {BUSINESS_CERTIFICATE_MISSING_TEXT[m]}</li>
            ))}
          </ul>
        )}

        <div className="space-y-2 border-t border-[var(--biz-border)] pt-3">
          <h3 className="text-sm font-bold text-[var(--biz-text)]">ИНН</h3>
          <BusinessLegalIdentityForm identity={identity} canEdit={context.canEditIdentity} />
        </div>

        <div className="space-y-1 border-t border-[var(--biz-border)] pt-3 text-sm leading-6">
          <h3 className="text-sm font-bold text-[var(--biz-text)]">Адрес заведения</h3>
          {state.venueAddressLine ? (
            <p className="text-[var(--biz-text)]">{state.venueName} – {state.venueAddressLine}</p>
          ) : (
            <p className="text-[var(--biz-text-muted)]">Адрес не указан.</p>
          )}
          {context.canEditIdentity ? (
            <Link href="/preferences#venue" className="font-semibold text-[var(--biz-accent)] underline underline-offset-2" data-testid="biz-certificate-address-link">
              {state.venueAddressLine ? "Изменить адрес заведения" : "Указать адрес заведения"}
            </Link>
          ) : null}
        </div>
      </section>
    </>
  );
}
