/**
 * Account-level Business offer (договор-оферта «АудиоЛад Бизнес»).
 *
 * The offer is the document an owner accepts: at the gift start (checkbox) and in the
 * cabinet («Принять условия») before the first payment. One acceptance per account and
 * edition covers every point of that owner; the same edition is never asked twice.
 * Version and hash must match a seed row of business_offer_editions (edition 1:
 * 20270218120000_business_offer_editions.sql, edition 2: 20270303120000_business_offer_edition_2.sql, edition 4: 20270331120000_business_offer_edition_4.sql, edition 5: 20270403120000_business_offer_edition_5.sql).
 * A new text needs a new
 * edition (version + hash + seed row); the owner then accepts it once more.
 *
 * The approved Business documents stay unchanged and are annexes of the offer.
 * Accepting the offer also records the current edition of annex 1 («b2b-terms») in
 * business_offer_acceptances, which create_business_subscription_order requires.
 * The cabinet links to the texts on this site. There is no third-party address.
 */

export const BUSINESS_OFFER_DOCUMENT_ID = "business-offer";

export const BUSINESS_OFFER_HREF = "/documents/business-offer";
/** Absolute link for Business surfaces served on audiolad.ru (landing /b, /b/prava, coffee atlas). */
export const BUSINESS_OFFER_URL = `https://business.audiolad.ru${BUSINESS_OFFER_HREF}`;

export const BUSINESS_OFFER_TITLE = "Договор-оферта «АудиоЛад Кофейня»";

export const BUSINESS_OFFER_SUMMARY =
  "Основной договор: 7 дней в подарок, разовые оплаты, продление и возврат, лицензия на музыку, сертификат заведения и защита заведения. Стоимость доступа к сервису фоновой музыки АудиоЛад для одного заведения на 30 дней – по действующему тарифу, который показан в личном кабинете до оплаты. Приложения 1–4 – часть договора.";

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

/**
 * Current edition of the offer text (docs/business/public/business-offer.md): «АудиоЛад Кофейня»,
 * edition 5 of 19.11.2026 with annexes 1–4 in the same file (t1620u / t1621u). Seed:
 * 20270403120000_business_offer_edition_5.sql. Edition 4 text:
 * archive/business-offer-v4-2026-11-19.md (seed 20270331120000_business_offer_edition_4.sql).
 */
export const BUSINESS_OFFER_EDITION: BusinessOfferDocumentEdition = {
  documentKey: BUSINESS_OFFER_DOCUMENT_ID,
  version: "offer-v5-2026-11-19",
  contentHash: "939773fb3900534b3179ffd53320628920280b27806b3dcb75aeac35bb947b2e",
  label: "Редакция 5 от 19.11.2026",
};

export type BusinessOfferEdition = {
  documentKey: "b2b-terms";
  version: string;
  contentHash: string;
};

const CURRENT_EDITION: BusinessOfferEdition = {
  documentKey: "b2b-terms",
  version: "r9-2026-11-19",
  contentHash: "22508fe0609bc9278b2513b36b6c9a1f24789776524bb4b80f4613005861dc29",
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

/**
 * An earlier edition is accepted, the current one is not yet: the cabinet says «новая редакция»
 * instead of «перед первой оплатой». Only the pay controls use it; access is never gated on it.
 */
export function hasAcceptedEarlierBusinessOfferOnly(rows: unknown): boolean {
  if (!Array.isArray(rows) || hasAcceptedCurrentBusinessOffer(rows)) return false;
  return rows.some((row) => {
    if (!row || typeof row !== "object") return false;
    const r = row as { document_key?: unknown; document_version?: unknown };
    return r.document_key === BUSINESS_OFFER_DOCUMENT_ID && typeof r.document_version === "string";
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

/**
 * record_business_offer_edition_acceptance refused because the account is a member of an
 * organization without being its owner (SQL: not_organization_owner, 42501).
 */
export function isNotOfferPartyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  return e.code === "42501" && typeof e.message === "string" && e.message.includes("not_organization_owner");
}
