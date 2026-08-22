import CatalogProductTile from "@/components/products/CatalogProductTile";
import type { CatalogProduct } from "@/lib/products/catalog";

/**
 * Experimental catalog tile grid.
 * Mobile 2 / tablet (md) 3 / desktop preview (xl) 4.
 * `xl` matches the listener desktop shell breakpoint.
 */
export const PRODUCT_GRID_CLASS_NAME =
  "grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 md:gap-4 xl:grid-cols-4";

type ProductGridProps = {
  products: CatalogProduct[];
  ariaLabel?: string;
};

export default function ProductGrid({ products, ariaLabel }: ProductGridProps) {
  if (products.length === 0) {
    return null;
  }

  return (
    <ul className={PRODUCT_GRID_CLASS_NAME} aria-label={ariaLabel}>
      {products.map((product) => (
        <li key={product.id} className="min-w-0">
          <CatalogProductTile product={product} />
        </li>
      ))}
    </ul>
  );
}
