import { GUEST_COFFEE_LEGAL_FOOTER_TITLE } from "@/lib/business-app/guest-coffee/benefits";
import {
  BUSINESS_LEGAL_CERTIFICATE_HREF,
  BUSINESS_LEGAL_HREF,
  BUSINESS_LEGAL_OFFER_HREF,
  BUSINESS_LEGAL_PROTECTION_HREF,
  BUSINESS_LEGAL_RIGHTS_HREF,
  businessLegalAbsoluteUrl,
} from "@/lib/business/legal/section";

/**
 * t1667u (Sergey 24.11.2026 11:22): footer of the guest coffee page (before sign-up the «Документы»
 * menu is locked) with the five pages of the legal section. The section lives on audiolad.ru, the
 * cabinet on coffee./business., so the links are absolute to our own site, like the owner cabinet.
 * This overrides the earlier «no legal footer on coffee pages» rule for this guest page only.
 */
export const GUEST_COFFEE_LEGAL_LINKS = [
  { id: "legal", title: "Правовая информация", href: businessLegalAbsoluteUrl(BUSINESS_LEGAL_HREF) },
  { id: "offer", title: "Договор-оферта", href: businessLegalAbsoluteUrl(BUSINESS_LEGAL_OFFER_HREF) },
  { id: "rights", title: "Как устроены права на музыку", href: businessLegalAbsoluteUrl(BUSINESS_LEGAL_RIGHTS_HREF) },
  { id: "protection", title: "Ответственность и защита заведения", href: businessLegalAbsoluteUrl(BUSINESS_LEGAL_PROTECTION_HREF) },
  { id: "certificate", title: "Сертификат на заведение", href: businessLegalAbsoluteUrl(BUSINESS_LEGAL_CERTIFICATE_HREF) },
] as const;

export default function GuestCoffeeLegalFooter() {
  return (
    <footer
      className="mt-8 border-t border-[var(--biz-border)] pt-5 pb-2"
      data-testid="guest-coffee-legal-footer"
    >
      <p className="text-[0.8rem] font-semibold uppercase tracking-wide text-[var(--biz-text-muted)]">{GUEST_COFFEE_LEGAL_FOOTER_TITLE}</p>
      <nav aria-label={GUEST_COFFEE_LEGAL_FOOTER_TITLE}>
        <ul className="mt-2 flex flex-col gap-2 text-[0.9rem] sm:flex-row sm:flex-wrap sm:gap-x-5">
          {GUEST_COFFEE_LEGAL_LINKS.map((l) => (
            <li key={l.id}>
              <a
                href={l.href}
                target="_blank"
                rel="noopener"
                className="text-[var(--biz-text-muted)] underline underline-offset-2 hover:text-[var(--biz-accent)]"
                data-testid={`guest-coffee-legal-${l.id}`}
              >
                {l.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
