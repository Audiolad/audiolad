import { isAurafonAuthor } from "@/lib/authors/aurafon";
import { PRODUCT_KIND } from "@/lib/author-products/product-kind";

/**
 * On-page product text quality review.
 * Aurafon keeps the review on every product type.
 * Every other author gets it only for music / release.
 * Gate by UUID and product type — never slug/name.
 */
export function isAuthorProductQualityReviewEnabled(
  authorId: string | null | undefined,
  context?: {
    productKind?: string | null;
    publicationClass?: string | null;
  },
): boolean {
  if (isAurafonAuthor(authorId)) {
    return true;
  }

  const productKind = context?.productKind?.trim() ?? "";
  const publicationClass = context?.publicationClass?.trim() ?? "";

  return (
    productKind === PRODUCT_KIND.MUSIC || publicationClass === "release"
  );
}

export function assertAuthorProductQualityReviewEnabled(
  authorId: string,
  context?: {
    productKind?: string | null;
    publicationClass?: string | null;
  },
): void {
  if (!isAuthorProductQualityReviewEnabled(authorId, context)) {
    const error = new Error("product_quality_review_beta_disabled");
    (error as Error & { code: string; status: number }).code =
      "product_quality_review_beta_disabled";
    (error as Error & { code: string; status: number }).status = 403;
    throw error;
  }
}
