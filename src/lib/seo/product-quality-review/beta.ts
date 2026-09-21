import { isAurafonAuthor } from "@/lib/authors/aurafon";

/**
 * Closed beta for on-page product text quality review.
 * Gate by Aurafon author UUID only — never slug/name.
 */
export function isAuthorProductQualityReviewEnabled(
  authorId: string | null | undefined,
): boolean {
  return isAurafonAuthor(authorId);
}

export function assertAuthorProductQualityReviewEnabled(
  authorId: string,
): void {
  if (!isAuthorProductQualityReviewEnabled(authorId)) {
    const error = new Error("product_quality_review_beta_disabled");
    (error as Error & { code: string; status: number }).code =
      "product_quality_review_beta_disabled";
    (error as Error & { code: string; status: number }).status = 403;
    throw error;
  }
}
