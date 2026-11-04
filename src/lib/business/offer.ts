/**
 * Account-level Business offer (договор-оферта «АудиоЛад Бизнес»).
 *
 * The offer is the document an owner accepts: at the gift start (checkbox) and in the
 * cabinet («Принять условия») before the first payment. One acceptance per account and
 * edition covers every point of that owner; the same edition is never asked twice.
 * Version and hash must match the seed row of business_offer_editions in
 * supabase/migrations/20270218120000_business_offer_editions.sql. A new text needs a new
 * edition (version + hash + seed row); the owner then accepts it once more.
 *
 * The approved Business documents stay unchanged and are annexes of the offer.
 * Accepting the offer also records the current edition of annex 1 («b2b-terms») in
 * business_offer_acceptances, which create_business_subscription_order requires.
 * The cabinet links to the texts on this site. There is no third-party address.
 */

export const BUSINESS_OFFER_DOCUMENT_ID = "business-offer";

export const BUSINESS_OFFER_HREF = "/documents/business-offer";

export const BUSINESS_OFFER_TITLE = "Договор-оферта «АудиоЛад Бизнес»";

export const BUSINESS_OFFER_SUMMARY =
  "Основной договор: 7 дней в подарок, 799 ₽ за точку на 30 дней, разовые оплаты, продление и возврат. Остальные документы – его приложения.";

export const BUSINESS_ONBOARDING_HREF = "/onboarding";

/** Annex 1 of the offer: the approved licensing terms (unchanged document). */
export const BUSINESS_LICENSING_TERMS_HREF = "/documents/b2b-terms";

export const BUSINESS_LICENSING_TERMS_TITLE = "Условия лицензирования музыки для бизнеса";

export type BusinessOfferDocumentEdition = {
  documentKey: typeof BUSINESS_OFFER_DOCUMENT_ID;
  version: string;
  contentHash: string;
  /** Shown on the offer page and next to every accept button. */
  label: string;
};

/** Current edition of the offer text (docs/business/public/business-offer.md). */
export const BUSINESS_OFFER_EDITION: BusinessOfferDocumentEdition = {
  documentKey: BUSINESS_OFFER_DOCUMENT_ID,
  version: "offer-v1-2026-11-04",
  contentHash: "9d4046f36c20f5702697eac0af26de1c3579c6929c61d8ac4441c0b39617c7dc",
  label: "Редакция 1 от 04.11.2026",
};

export type BusinessOfferEdition = {
  documentKey: "b2b-terms";
  version: string;
  contentHash: string;
};

const CURRENT_EDITION: BusinessOfferEdition = {
  documentKey: "b2b-terms",
  version: "r8-2026-10-18",
  contentHash: "0fbbfe610f344920a084e58b5987cce5f4d7033528abc8760aac07b89de7078a",
};

const LEGACY_EDITION: BusinessOfferEdition = {
  documentKey: "b2b-terms",
  version: "r6.1-2026-10-18",
  contentHash: "a3e74c3a6b06bd6c8e29ecc6e832984a7a2f7f5af75c44252c7ba1a85c98bc88",
};

/** Edition of annex 1 («b2b-terms») shown at /documents/b2b-terms for this flag value. */
export function currentBusinessOfferEdition(unifiedAgreementEnabled: boolean): BusinessOfferEdition {
  return unifiedAgreementEnabled ? CURRENT_EDITION : LEGACY_EDITION;
}

/** True when the client-side accept carried exactly the edition published now. */
export function isCurrentBusinessOfferEdition(version: unknown, contentHash: unknown): boolean {
  return version === BUSINESS_OFFER_EDITION.version && contentHash === BUSINESS_OFFER_EDITION.contentHash;
}

/**
 * Body of POST /api/business/subscription/accept. Consent is recorded only for the edition
 * the page explicitly names: an empty, malformed or edition-less body is refused, never
 * treated as consent to whatever edition is published now.
 */
export function isShownCurrentBusinessOfferBody(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const { offerVersion, offerHash } = body as { offerVersion?: unknown; offerHash?: unknown };
  return isCurrentBusinessOfferEdition(offerVersion, offerHash);
}

/** Rows of business_offer_edition_acceptances_for_caller(): has the owner accepted the current edition? */
export function hasAcceptedCurrentBusinessOffer(rows: unknown): boolean {
  if (!Array.isArray(rows)) return false;
  return rows.some((row) => {
    if (!row || typeof row !== "object") return false;
    const r = row as { document_key?: unknown; document_version?: unknown; content_hash?: unknown };
    return r.document_key === BUSINESS_OFFER_DOCUMENT_ID && isCurrentBusinessOfferEdition(r.document_version, r.content_hash);
  });
}

export type BusinessOfferPaymentGate = "ok" | "offer_acceptance_required" | "unavailable";

/**
 * Shared payment gate: a business_subscription order is paid only after the current edition
 * of the договор-оферта is accepted, whichever route starts the payment (cabinet checkout or
 * /api/payments with an order id). Other order kinds are not affected. A read error is
 * "unavailable", never "accepted".
 */
export async function businessOfferPaymentGate(
  orderKind: unknown,
  loadAcceptances: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<BusinessOfferPaymentGate> {
  if (orderKind !== "business_subscription") return "ok";
  const { data, error } = await loadAcceptances();
  if (error) return "unavailable";
  return hasAcceptedCurrentBusinessOffer(data) ? "ok" : "offer_acceptance_required";
}
