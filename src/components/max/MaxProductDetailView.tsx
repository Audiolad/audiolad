"use client";

import type { ReactNode } from "react";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import FeaturedProductCard, {
  FEATURED_CARD_CHIP_CLASS,
  FEATURED_CARD_META_CLASS,
  FEATURED_CARD_SUBTITLE_CLASS,
  FEATURED_CARD_TITLE_CLASS,
} from "@/components/home/FeaturedProductCard";
import MaxAuthorAppreciation from "@/components/max/MaxAuthorAppreciation";
import MaxProductRating from "@/components/max/MaxProductRating";
import MaxProductLegalFooter from "@/components/max/MaxProductLegalFooter";
import PracticeHeroGallery from "@/components/products/practice-page/PracticeHeroGallery";
import type { PracticePageCoverData } from "@/components/products/practice-page/types";
import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";
import type { CatalogSlide } from "@/lib/catalog/dto";
import {
  getProductCoverGradient,
  getProductCoverSymbol,
} from "@/lib/products/cover-display";
import { formatMaxDuration } from "@/lib/max/format-duration";
import type { MaxProductDetailView as MaxProductDetailModel } from "@/lib/max/product-view";
import type { MaxCatalogProduct } from "@/components/max/MaxCatalogSearch";

type MaxProductDetailViewProps = {
  authorSlug: string;
  productSlug: string;
  product: MaxProductDetailModel;
  listenSlot: ReactNode;
  onOpenRecommendation: (product: MaxCatalogProduct) => void;
  onOpenTopic: (topicKey: string) => void;
};

function toHeroCover(slug: string, title: string, coverUrl: string | null): PracticePageCoverData {
  return {
    displayUrl: coverUrl,
    responsive: {
      src: coverUrl,
      manifest: null,
      srcSet: null,
      sizes: "100vw",
    },
    alt: title,
    gradient: getProductCoverGradient(slug),
    symbol: getProductCoverSymbol(slug),
    displayWidth: 640,
  };
}

export default function MaxProductDetailView({
  authorSlug,
  productSlug,
  product,
  listenSlot,
  onOpenRecommendation,
  onOpenTopic,
}: MaxProductDetailViewProps) {
  const slides: CatalogSlide[] = product.gallery.map((slide, index) => ({
    id: slide.id,
    image_url: slide.image_url,
    alt: slide.alt,
    position: index,
  }));

  return (
    <div data-max-product-detail="">
      <section className="mt-6 min-w-0" data-practice-section="hero">
        <FeaturedProductCard
          className="practice-product-hero"
          data-practice-product-hero=""
          data-practice-hero-has-gallery={slides.length > 0 ? "true" : "false"}
          cover={
            <PracticeHeroGallery
              cover={toHeroCover(productSlug, product.title, product.coverUrl)}
              slides={slides}
              priority
              showMobileDots
            />
          }
        >
          {product.formatLabel ? (
            <span data-practice-hero-type-chip className={FEATURED_CARD_CHIP_CLASS}>
              {product.formatLabel}
            </span>
          ) : null}
          <h1 className={FEATURED_CARD_TITLE_CLASS}>{product.title}</h1>
          {product.subtitle ? (
            <p className={FEATURED_CARD_SUBTITLE_CLASS}>{product.subtitle}</p>
          ) : null}
          {product.metaLine ? (
            <p className={FEATURED_CARD_META_CLASS} data-max-product-meta="">
              {product.metaLine}
            </p>
          ) : null}
          {!product.isFree ? (
            <p className="mt-3 text-[22px] font-semibold leading-tight text-[#25135c]" data-max-product-price="">
              {product.priceLabel}
            </p>
          ) : null}
          <div className="practice-product-hero__cta shrink-0">{listenSlot}</div>
        </FeaturedProductCard>
      </section>

      <MaxProductRating
        key={`${authorSlug}/${productSlug}`}
        authorSlug={authorSlug}
        productSlug={productSlug}
        enabled={product.rating.enabled}
        initialAggregate={product.rating.aggregate}
      />

      {product.appreciation ? (
        <MaxAuthorAppreciation
          authorName={product.appreciation.authorName}
          authorSlug={authorSlug}
          productSlug={productSlug}
        />
      ) : null}

      {product.topics.length ? (
        <nav aria-label="Темы практики" data-practice-section="topics" className="mt-4">
          <p className="mb-1.5 text-xs font-medium text-[#7d70a2]">Темы</p>
          <ul className="flex flex-row flex-wrap items-center gap-2">
            {product.topics.map((topic) => (
              <li key={topic.key} className="max-w-full shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenTopic(topic.key)}
                  className="inline-flex min-h-11 max-w-full items-center whitespace-normal rounded-full border border-[#e4d7f4] bg-[#faf7ff] px-2.5 py-1 text-[10px] font-medium leading-tight text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                >
                  {topic.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {product.contents.length ? (
        <ol className="mt-6 space-y-2 text-sm" data-max-product-contents="">
          {product.contents.map((track) => (
            <li key={`${track.position}-${track.title}`}>
              {track.position}. {track.title}
              {track.durationSeconds !== null ? ` · ${formatMaxDuration(track.durationSeconds)}` : ""}
            </li>
          ))}
        </ol>
      ) : null}

      {product.recommendations.length ? (
        <section
          data-practice-section="author-recommendations"
          className="mt-6 overflow-hidden rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]"
          aria-labelledby="max-author-recommendations-title"
        >
          <h2 id="max-author-recommendations-title" className="text-lg font-semibold text-[#2b2140]">
            {product.recommendationsTitle}
          </h2>
          <ul className="mt-3 grid w-full max-w-full grid-cols-1 gap-2">
            {product.recommendations.map((item) => {
              const details = [item.authorName, item.durationLabel].filter(Boolean).join(" · ");
              return (
                <li key={`${item.authorSlug}/${item.slug}`} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpenRecommendation(item)}
                    className="flex w-full max-w-full min-w-0 items-center gap-3 rounded-[16px] border border-[#eadff8] bg-white px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[12px]" aria-hidden="true">
                      <ProductCoverThumbnail
                        slug={item.slug}
                        title={item.title}
                        coverUrl={item.coverUrl}
                        authorName={item.authorName}
                        coverAlt="Обложка"
                        displayWidth={56}
                        className="h-full w-full rounded-[12px]"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      {item.formatLabel ? (
                        <p className={PRODUCT_FORMAT_LINE_CLASS}>{item.formatLabel}</p>
                      ) : null}
                      <p className={`line-clamp-2 text-[14px] font-semibold leading-[1.25] text-[#25135c] ${item.formatLabel ? "mt-0.5" : ""}`}>
                        {item.title}
                      </p>
                      {details ? (
                        <p className="mt-0.5 truncate text-[12px] leading-4 text-[#5c4f82]">{details}</p>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <MaxProductLegalFooter />
    </div>
  );
}
