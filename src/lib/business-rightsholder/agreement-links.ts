/**
 * 8d9cd0af (Sergey 18.10.2026 17:30): the unified agreement 2.0 is accepted PER author workspace,
 * while the rights check is one application per account (pseudonyms included). A red message that
 * asks to accept something elsewhere must link straight to that place. Pure, browser-safe.
 */

/** Anchor of the acceptance card on /author-dashboard/legal. */
export const AGREEMENT_ACCEPT_ANCHOR = "author-terms-accept";

/** Direct link to the 2.0 acceptance of one workspace. */
export function agreementAcceptHref(authorSlug: string): string {
  return `/author-dashboard/legal?author=${encodeURIComponent(authorSlug)}#${AGREEMENT_ACCEPT_ANCHOR}`;
}

export type ProductWorkspace = {
  slug: string;
  name: string;
  /** Unified agreement accepted in this workspace; null in the legacy (flag off) flow. */
  agreementAccepted: boolean | null;
};

/** Products of workspaces with the agreement first, the opened workspace first among equals. Stable. */
export function orderProductsForVerification<T extends { workspace?: ProductWorkspace | null }>(
  products: readonly T[],
  openedSlug: string,
): T[] {
  const rank = (p: T) =>
    (p.workspace?.agreementAccepted === false ? 2 : 0) + (p.workspace?.slug === openedSlug ? 0 : 1);
  return products
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map(({ p }) => p);
}
