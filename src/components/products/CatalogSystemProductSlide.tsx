import type { ReactNode } from "react";
import Link from "next/link";

import type { CatalogProduct } from "@/lib/products/catalog";
import {
  resolveCatalogCardVisual,
  type CatalogCardVisual,
} from "@/lib/products/catalog-card-visual";

type CatalogSystemProductSlideLayout = "standalone" | "fill";

type CatalogSystemProductSlideProps = {
  product: CatalogProduct;
  visual?: CatalogCardVisual;
  playControl?: ReactNode;
  /**
   * `standalone` (default): own 3:4 box for 0-slide tiles.
   * `fill`: 100%×100% of the carousel slide — no second aspect sizing context.
   */
  layout?: CatalogSystemProductSlideLayout;
};

/** Canonical first-slide (and later carousel slide) geometry. */
export const CATALOG_SYSTEM_SLIDE_ASPECT_CLASS = "aspect-[3/4]";

/** Two-line clamp. No min-height — the 3:4 leftover strip is only ~45–56px. */
export const CATALOG_PRODUCT_TILE_TITLE_CLASS =
  "line-clamp-2 min-h-0 text-[13px] font-semibold leading-4 text-[#25135c]";

function CatalogSystemTypeChip({ label }: { label: string }) {
  return (
    <p
      className="absolute bottom-1.5 left-1.5 z-[1] max-w-[calc(100%-3.25rem)] truncate rounded-full bg-[#25135c]/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-3 tracking-[0.06em] text-white"
      data-catalog-tile-type=""
    >
      {label}
    </p>
  );
}

function CatalogSystemCover({
  product,
  visual,
}: {
  product: CatalogProduct;
  visual: CatalogCardVisual;
}) {
  const alt = product.title;
  const typeLabel = product.productTypeLabel?.trim() || null;
  const placeholder = visual.image?.placeholderBlurDataUrl ?? null;

  if (visual.hasSquareCover && visual.image) {
    const { src, srcSet, sizes } = visual.image;

    return (
      <div
        className="relative aspect-square w-full shrink-0 overflow-hidden bg-[#f4ecfb]"
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
        {typeLabel ? <CatalogSystemTypeChip label={typeLabel} /> : null}
      </div>
    );
  }

  return (
    <div
      className={`relative flex aspect-square w-full shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br ${visual.systemFallback.gradientClassName} text-4xl text-white`}
      data-catalog-tile-cover="system"
      data-catalog-tile-fallback="system"
      role="img"
      aria-label={alt}
    >
      {visual.systemFallback.symbol}
      {typeLabel ? <CatalogSystemTypeChip label={typeLabel} /> : null}
    </div>
  );
}

function CatalogSystemSlideMeta({
  authorName,
  durationLabel,
}: {
  authorName: string | null;
  durationLabel: string | null;
}) {
  if (!authorName && !durationLabel) {
    return null;
  }

  return (
    <p
      className="flex min-w-0 items-baseline text-[11px] leading-3"
      data-catalog-tile-meta=""
    >
      {authorName ? (
        <span
          className="min-w-0 truncate font-medium text-[#7042c5]"
          data-catalog-tile-author=""
        >
          {authorName}
        </span>
      ) : null}
      {authorName && durationLabel ? (
        <span className="shrink-0 text-[#7d70a2]" aria-hidden="true">
          {" · "}
        </span>
      ) : null}
      {durationLabel ? (
        <span className="shrink-0 text-[#7d70a2]" data-catalog-tile-duration="">
          {durationLabel}
        </span>
      ) : null}
    </p>
  );
}

/**
 * System first slide: one 3:4 frame that includes Play.
 * Later ProductCardCarousel can use this as Slide 1 (author slides also 3:4).
 */
export default function CatalogSystemProductSlide({
  product,
  visual: visualProp,
  playControl,
  layout = "standalone",
}: CatalogSystemProductSlideProps) {
  const visual = visualProp ?? resolveCatalogCardVisual(product);
  const durationLabel = product.statsLabel?.trim() || null;
  const authorName = product.authorName?.trim() || null;
  const fillsParent = layout === "fill";

  return (
    <div
      className={`relative flex w-full flex-col overflow-hidden rounded-[18px] bg-[#faf7ff] ${
        fillsParent
          ? "h-full min-h-0 min-w-0"
          : CATALOG_SYSTEM_SLIDE_ASPECT_CLASS
      }`}
      data-catalog-system-slide=""
      data-catalog-system-slide-aspect="3/4"
      data-catalog-system-slide-layout={layout}
    >
      <Link
        href={product.href}
        className="flex min-h-0 min-w-0 flex-1 flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#7042c5]"
      >
        <CatalogSystemCover product={product} visual={visual} />

        <div
          className="flex min-h-0 flex-1 flex-col justify-center gap-0.5 px-1.5 py-0.5"
          data-catalog-tile-info=""
        >
          <h3 className={CATALOG_PRODUCT_TILE_TITLE_CLASS}>{product.title}</h3>

          <CatalogSystemSlideMeta
            authorName={authorName}
            durationLabel={durationLabel}
          />
        </div>
      </Link>
      {playControl}
    </div>
  );
}
