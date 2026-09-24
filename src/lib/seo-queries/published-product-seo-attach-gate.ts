import { isMusicProductWizardEnabled } from "@/lib/author-products/music-product-wizard";
import { isAuthorSeoDiscoveryEnabled } from "@/lib/seo-queries/discovery-beta";

/**
 * Published-product SEO retrofit attach gate.
 *
 * Aurafon keeps the existing closed-beta attach surface for every product.
 * Every other author may attach only when the product is factual music
 * (`product_kind = music`) or a release (`publication_class = release`).
 *
 * Callers must pass fields from the product already loaded on the server
 * or from the author form's saved product. Client-supplied kind/class is
 * not proof on the API.
 *
 * Does not open the standalone dashboard «Что ищут слушатели».
 */
export function isPublishedProductSeoAttachEnabled(input: {
  authorId?: string | null;
  productKind?: string | null;
  publicationClass?: string | null;
}): boolean {
  return (
    isAuthorSeoDiscoveryEnabled(input.authorId) ||
    isMusicProductWizardEnabled({
      authorId: input.authorId,
      productKind: input.productKind,
      publicationClass: input.publicationClass,
    })
  );
}

export function assertPublishedProductSeoAttachEnabled(input: {
  authorId: string;
  productKind?: string | null;
  publicationClass?: string | null;
}): void {
  if (!isPublishedProductSeoAttachEnabled(input)) {
    const error = new Error("seo_discovery_beta_disabled") as Error & {
      code: string;
      status: number;
    };
    error.code = "seo_discovery_beta_disabled";
    error.status = 403;
    throw error;
  }
}
