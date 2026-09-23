import { PRODUCT_KIND } from "@/lib/author-products/product-kind";

/**
 * 4-step music product wizard for every author workspace.
 *
 * True when productKind is music or publicationClass is release.
 * `authorId` is part of the signature so call sites name the workspace;
 * it does not restrict the wizard to one author.
 *
 * Practice, course, audiobook, and post stay on the legacy form unless the
 * separate Aurafon product-wizard beta is enabled.
 */
export function isMusicProductWizardEnabled(input: {
  authorId?: string | null;
  productKind?: string | null;
  publicationClass?: string | null;
}): boolean {
  const productKind = input.productKind?.trim() ?? "";
  const publicationClass = input.publicationClass?.trim() ?? "";

  return (
    productKind === PRODUCT_KIND.MUSIC || publicationClass === "release"
  );
}
