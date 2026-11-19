import Link from "next/link";

import BusinessLegalIdentityForm from "@/components/business-app/legal/BusinessLegalIdentityForm";
import BusinessOfferReacceptPrompt from "@/components/business-app/legal/BusinessOfferReacceptPrompt";
import {
  BUSINESS_CERTIFICATE_MISSING_TEXT,
  certificateDisplayNumber,
  type CertificateMissing,
} from "@/lib/business/legal/certificate";
import type { CabinetCertificateContext } from "@/lib/business/legal/certificate-context.server";

export const BUSINESS_CERTIFICATE_CABINET_HREF = "/documents/sertifikat";

/** Якоря блоков, где исправляется каждый пункт (t1604u): красный пункт ведёт прямо туда. */
export const BUSINESS_CERTIFICATE_INN_ANCHOR_ID = "legal-inn";
export const BUSINESS_OFFER_REACCEPT_ANCHOR_ID = "offer-reaccept";
export const BUSINESS_CERTIFICATE_MISSING_HREF: Partial<Record<CertificateMissing, string>> = {
  inn: `/documents#${BUSINESS_CERTIFICATE_INN_ANCHOR_ID}`,
  inn_inactive: `/documents#${BUSINESS_CERTIFICATE_INN_ANCHOR_ID}`,
  address: "/preferences#venue",
  offer: `/documents#${BUSINESS_OFFER_REACCEPT_ANCHOR_ID}`,
};

/** Пункт «что заполнить»: ссылка на место, где это исправляется, или просто текст. */
export function BusinessCertificateMissingItem({ missing }: { missing: CertificateMissing }) {
  const href = BUSINESS_CERTIFICATE_MISSING_HREF[missing];
  const text = BUSINESS_CERTIFICATE_MISSING_TEXT[missing];
  return (
    <li data-missing={missing}>
      •{" "}
      {href ? (
        <Link href={href} className="font-semibold text-[var(--biz-accent)] underline underline-offset-2" data-testid="biz-certificate-missing-link">
          {text}
        </Link>
      ) : (
        text
      )}
    </li>
  );
}

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
              <BusinessCertificateMissingItem key={m} missing={m} />
            ))}
          </ul>
        )}

        <div className="business-cert-anchor space-y-2 border-t border-[var(--biz-border)] pt-3" id={BUSINESS_CERTIFICATE_INN_ANCHOR_ID}>
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
