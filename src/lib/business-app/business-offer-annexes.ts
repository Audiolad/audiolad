import { clientDocumentHref, findClientDocument } from "@/lib/business-app/client-documents";

/**
 * Annexes of the Business offer, in the order of section 9 of the offer text.
 * They are the approved Business documents, linked unchanged.
 */
export const BUSINESS_OFFER_ANNEX_IDS = ["b2b-terms", "venue-license", "claims-procedure", "claim-reply-kit"] as const;

export type BusinessOfferAnnex = { number: number; id: string; title: string; href: string };

export function businessOfferAnnexes(): BusinessOfferAnnex[] {
  return BUSINESS_OFFER_ANNEX_IDS.map((id, index) => {
    const doc = findClientDocument(id);
    if (!doc) throw new Error(`business_offer_annex_missing:${id}`);
    return { number: index + 1, id, title: doc.title, href: clientDocumentHref(id) };
  });
}
