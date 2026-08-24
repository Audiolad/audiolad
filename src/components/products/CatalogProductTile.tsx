import CatalogProductCarouselCard from "@/components/products/CatalogProductCarouselCard";
import CatalogSystemProductSlide, {
  CATALOG_PRODUCT_TILE_TITLE_CLASS,
} from "@/components/products/CatalogSystemProductSlide";
import CatalogTilePlayControl from "@/components/products/CatalogTilePlayControl";
import type { CatalogProduct } from "@/lib/products/catalog";
import type { CatalogAuthorSlide } from "@/lib/products/catalog-tile-carousel";

export { CATALOG_PRODUCT_TILE_TITLE_CLASS };

type CatalogProductTileProps = {
  product: CatalogProduct;
  authorSlides?: readonly CatalogAuthorSlide[];
};

export default function CatalogProductTile({
  product,
  authorSlides = [],
}: CatalogProductTileProps) {
  const authorSlug = product.authorSlug?.trim() || null;
  const playControl = authorSlug ? (
    <CatalogTilePlayControl
      authorSlug={authorSlug}
      productSlug={product.slug}
      title={product.title}
    />
  ) : null;

  if (authorSlides.length === 0) {
    return (
      <article className="min-w-0" data-catalog-product-tile="">
        <CatalogSystemProductSlide product={product} playControl={playControl} />
      </article>
    );
  }

  return (
    <article className="min-w-0" data-catalog-product-tile="">
      <CatalogProductCarouselCard
        product={product}
        authorSlides={authorSlides}
        playControl={playControl}
      />
    </article>
  );
}
