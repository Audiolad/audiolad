import CatalogSystemProductSlide, {
  CATALOG_PRODUCT_TILE_TITLE_CLASS,
} from "@/components/products/CatalogSystemProductSlide";
import CatalogTilePlayControl from "@/components/products/CatalogTilePlayControl";
import type { CatalogProduct } from "@/lib/products/catalog";

export { CATALOG_PRODUCT_TILE_TITLE_CLASS };

type CatalogProductTileProps = {
  product: CatalogProduct;
};

export default function CatalogProductTile({ product }: CatalogProductTileProps) {
  const authorSlug = product.authorSlug?.trim() || null;

  return (
    <article className="min-w-0" data-catalog-product-tile="">
      <CatalogSystemProductSlide
        product={product}
        playControl={
          authorSlug ? (
            <CatalogTilePlayControl
              authorSlug={authorSlug}
              productSlug={product.slug}
              title={product.title}
            />
          ) : null
        }
      />
    </article>
  );
}
