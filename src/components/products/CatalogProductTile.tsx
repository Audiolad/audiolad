import Link from "next/link";

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
    <article className="flex h-full flex-col" data-catalog-product-tile="">
      <Link
        href={product.href}
        className="flex min-w-0 flex-1 flex-col rounded-[18px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <CatalogSystemProductSlide product={product} />
      </Link>
      {authorSlug ? (
        <CatalogTilePlayControl
          authorSlug={authorSlug}
          productSlug={product.slug}
          title={product.title}
        />
      ) : null}
    </article>
  );
}
