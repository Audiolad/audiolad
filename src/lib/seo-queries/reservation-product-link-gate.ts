import { isAurafonAuthor } from "@/lib/authors/aurafon";
import { PRODUCT_KIND } from "@/lib/author-products/product-kind";

/**
 * Authoritative reservation → product link gate.
 *
 * Callers must pass fields loaded from the practices row.
 * A client publication_class is not an input and is not proof.
 * Aurafon keeps the existing beta flow, including non-music products.
 * Every other author may link only when the product is factual music
 * (`product_kind = music`) or a release (`publication_class = release`).
 */
export function isSeoReservationProductLinkAllowed(input: {
  authorId?: string | null;
  productKind?: string | null;
  publicationClass?: string | null;
}): boolean {
  if (isAurafonAuthor(input.authorId)) {
    return true;
  }

  const productKind = input.productKind?.trim() ?? "";
  const publicationClass = input.publicationClass?.trim() ?? "";

  return productKind === PRODUCT_KIND.MUSIC || publicationClass === "release";
}
