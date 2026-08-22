import Link from "next/link";

import CatalogTilePlayControl from "@/components/products/CatalogTilePlayControl";
import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";
import type { CatalogProduct } from "@/lib/products/catalog";
import {
  resolveCatalogCardVisual,
  type CatalogCardVisual,
} from "@/lib/products/catalog-card-visual";

type CatalogProductTileProps = {
  product: CatalogProduct;
};

/** Two-line clamp with reserved height so grid rows stay even. */
export const CATALOG_PRODUCT_TILE_TITLE_CLASS =
  "mt-2 line-clamp-2 min-h-[44px] text-[15px] font-semibold leading-[22px] text-[#25135c]";

function CatalogTileFallbackVisual({
  product,
  visual,
}: {
  product: CatalogProduct;
  visual: CatalogCardVisual;
}) {
  const alt = product.title;
  const placeholder = visual.image?.placeholderBlurDataUrl ?? null;

  if (visual.fallbackMode === "square_blur" && visual.image) {
    const { src, srcSet, sizes } = visual.image;

    return (
      <div
        className="relative aspect-[4/5] overflow-hidden rounded-[20px] bg-[#f4ecfb]"
        data-catalog-tile-fallback="square_blur"
        style={
          placeholder
            ? {
                backgroundImage: `url(${JSON.stringify(placeholder)})`,
                backgroundSize: "cover",
              }
            : undefined
        }
      >
        {/* Same src/srcSet/sizes as the sharp square — one cached resource. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          srcSet={srcSet ?? undefined}
          sizes={srcSet ? sizes : undefined}
          alt=""
          aria-hidden
          data-catalog-tile-image="blur-background"
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
          loading="lazy"
          decoding="async"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          srcSet={srcSet ?? undefined}
          sizes={srcSet ? sizes : undefined}
          alt={alt}
          data-catalog-tile-image="square-cover"
          className="absolute left-1/2 top-1/2 aspect-square w-full -translate-x-1/2 -translate-y-1/2 object-cover"
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex aspect-[4/5] items-center justify-center rounded-[20px] bg-gradient-to-br ${visual.systemFallback.gradientClassName} text-4xl text-white`}
      data-catalog-tile-fallback="system"
      role="img"
      aria-label={alt}
    >
      {visual.systemFallback.symbol}
    </div>
  );
}

export default function CatalogProductTile({ product }: CatalogProductTileProps) {
  const visual = resolveCatalogCardVisual(product);
  const authorSlug = product.authorSlug?.trim() || null;

  return (
    <article className="relative h-full" data-catalog-product-tile="">
      <Link
        href={product.href}
        className="flex h-full flex-col rounded-[20px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <CatalogTileFallbackVisual product={product} visual={visual} />

        {product.productTypeLabel ? (
          <p className={`mt-2 ${PRODUCT_FORMAT_LINE_CLASS}`}>
            {product.productTypeLabel}
          </p>
        ) : null}

        <h3 className={CATALOG_PRODUCT_TILE_TITLE_CLASS}>{product.title}</h3>

        {product.authorName ? (
          <p className="mt-1 line-clamp-1 text-xs leading-4 text-[#7d70a2]">
            {product.authorName}
          </p>
        ) : null}
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
