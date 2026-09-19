import { isAuthorProductWizardEnabled } from "@/lib/author-products/product-wizard-beta";
import {
  PRODUCT_KIND,
  type ProductKind,
} from "@/lib/author-products/product-kind";

/**
 * Closed-beta music presentation profile: Aurafon wizard + MUSIC kind.
 * Does not enable practice/meditation redesign.
 */
export function isAurafonMusicWizard(input: {
  authorId: string | null | undefined;
  productKind: ProductKind | null | undefined;
}): boolean {
  return (
    isAuthorProductWizardEnabled(input.authorId) &&
    input.productKind === PRODUCT_KIND.MUSIC
  );
}
