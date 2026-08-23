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
   * `standalone` (default): auto-height marketplace card.
   * `fill`: fill the carousel slide wrapper (same content height).
   */
  layout?: CatalogSystemProductSlideLayout;
};

/** 2–3 readable title lines. Card height is content, not a poster ratio. */
export const CATALOG_PRODUCT_TILE_TITLE_CLASS =
  "line-clamp-3 min-h-0 text-[14px] font-semibold leading-5 text-[#25135c]";

function CatalogSystemTypeChip({ label }: { label: string }) {
  return (
    <p
      className="inline-flex max-w-full truncate rounded-full bg-[#efe6fb] px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-3 tracking-[0.06em] text-[#7042c5]"
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
      className="flex min-w-0 items-baseline text-[12px] leading-4"
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
 * Marketplace system card: 1:1 cover + info + compact Play.
 * Height follows content. No 3:4 / 9:16 poster box.
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
  const typeLabel = product.productTypeLabel?.trim() || null;
  const fillsParent = layout === "fill";

  return (
    <div
      className={`flex w-full flex-col overflow-hidden rounded-[18px] bg-[#faf7ff] ${
        fillsParent ? "h-full min-h-0 min-w-0" : ""
      }`}
      data-catalog-system-slide=""
      data-catalog-system-slide-layout={layout}
      data-catalog-system-slide-height="content"
    >
      <Link
        href={product.href}
        className="flex min-w-0 flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#7042c5]"
      >
        <CatalogSystemCover product={product} visual={visual} />

        <div
          className="flex min-w-0 flex-col gap-1 px-2 pt-2"
          data-catalog-tile-info=""
        >
          {typeLabel ? <CatalogSystemTypeChip label={typeLabel} /> : null}

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
