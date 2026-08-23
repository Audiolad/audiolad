import CatalogProductTile from "@/components/products/CatalogProductTile";
import type { CatalogProduct } from "@/lib/products/catalog";
import type { CatalogAuthorSlide } from "@/lib/products/catalog-tile-carousel";
import {
  PRODUCT_GRID_CLASS_NAME,
  PRODUCT_GRID_CONTAINER_CLASS_NAME,
} from "@/lib/products/product-grid-layout";

export { PRODUCT_GRID_CLASS_NAME };

type ProductGridProps = {
  products: CatalogProduct[];
  ariaLabel?: string;
  getAuthorSlides?: (product: CatalogProduct) => readonly CatalogAuthorSlide[];
};

export default function ProductGrid({
  products,
  ariaLabel,
  getAuthorSlides,
}: ProductGridProps) {
  if (products.length === 0) {
    return null;
  }

  return (
    <div
      className={PRODUCT_GRID_CONTAINER_CLASS_NAME}
      data-product-grid-container=""
    >
      <ul
        className={PRODUCT_GRID_CLASS_NAME}
        aria-label={ariaLabel}
        data-product-grid=""
      >
        {products.map((product) => (
          <li key={product.id} className="min-w-0">
            <CatalogProductTile
              product={product}
              authorSlides={getAuthorSlides?.(product)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
