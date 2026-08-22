import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";
import type { CatalogProduct } from "@/lib/products/catalog";
import {
  resolveCatalogCardVisual,
  type CatalogCardVisual,
} from "@/lib/products/catalog-card-visual";

type CatalogSystemProductSlideProps = {
  product: CatalogProduct;
  visual?: CatalogCardVisual;
};

/** Two-line clamp with reserved height so grid rows stay even. */
export const CATALOG_PRODUCT_TILE_TITLE_CLASS =
  "mt-1 line-clamp-2 min-h-[44px] text-[15px] font-semibold leading-[22px] text-[#25135c]";

function CatalogSystemCover({
  product,
  visual,
}: {
  product: CatalogProduct;
  visual: CatalogCardVisual;
}) {
  const alt = product.title;
  const placeholder = visual.image?.placeholderBlurDataUrl ?? null;

  if (visual.hasSquareCover && visual.image) {
    const { src, srcSet, sizes } = visual.image;

    return (
      <div
        className="relative aspect-square w-full overflow-hidden rounded-[18px] bg-[#f4ecfb]"
        data-catalog-tile-cover="square"
        style={
          placeholder
            ? {
                backgroundImage: `url(${JSON.stringify(placeholder)})`,
                backgroundSize: "cover",
              }
            : undefined
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          srcSet={srcSet ?? undefined}
          sizes={srcSet ? sizes : undefined}
          alt={alt}
          data-catalog-tile-image="square-cover"
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex aspect-square w-full items-center justify-center rounded-[18px] bg-gradient-to-br ${visual.systemFallback.gradientClassName} text-4xl text-white`}
      data-catalog-tile-cover="system"
      data-catalog-tile-fallback="system"
      role="img"
      aria-label={alt}
    >
      {visual.systemFallback.symbol}
    </div>
  );
}

/**
 * System first slide for the experimental catalog tile.
 * Later ProductCardCarousel can use this as Slide 1 without rewriting the tile.
 */
export default function CatalogSystemProductSlide({
  product,
  visual: visualProp,
}: CatalogSystemProductSlideProps) {
  const visual = visualProp ?? resolveCatalogCardVisual(product);
  const durationLabel = product.statsLabel?.trim() || null;

  return (
    <div
      className="flex min-w-0 flex-col"
      data-catalog-system-slide=""
    >
      <CatalogSystemCover product={product} visual={visual} />

      {product.productTypeLabel ? (
        <p className={`mt-2.5 ${PRODUCT_FORMAT_LINE_CLASS}`}>
          {product.productTypeLabel}
        </p>
      ) : null}

      <h3 className={CATALOG_PRODUCT_TILE_TITLE_CLASS}>{product.title}</h3>

      {product.authorName ? (
        <p
          className="mt-1 line-clamp-1 text-xs font-medium leading-4 text-[#7042c5]"
          data-catalog-tile-author=""
        >
          {product.authorName}
        </p>
      ) : null}

      {durationLabel ? (
        <p
          className="mt-1 line-clamp-1 text-xs leading-4 text-[#7d70a2]"
          data-catalog-tile-duration=""
        >
          {durationLabel}
        </p>
      ) : null}
    </div>
  );
}
