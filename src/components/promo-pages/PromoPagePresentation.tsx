"use client";

import Link from "next/link";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { getDisplayFormat } from "@/lib/author-products/format";
import { formatProductMeta } from "@/lib/products/duration";
import type { PublicPromoPageCtaBlock } from "@/lib/promo-pages/types";

export type PromoPagePresentationProduct = {
  practice_id: string;
  slug: string;
  title: string;
  format: string | null;
  duration_minutes: number | null;
  audio_count?: number;
  cover_url?: string | null;
  cover_image?: unknown;
  access_label?: string | null;
};

export type PromoPagePresentationProps = {
  publicTitle: string;
  publicDescription?: string | null;
  footerText?: string | null;
  cta?: PublicPromoPageCtaBlock | null;
  products: PromoPagePresentationProduct[];
  authorName?: string | null;
  authorSlug?: string | null;
  bannerUrl?: string | null;
  previewMode?: boolean;
  interactiveMode?: boolean;
  onPlayProduct?: (product: PromoPagePresentationProduct) => void;
  onCtaClick?: () => void;
  getPlayLabel?: (product: PromoPagePresentationProduct) => string;
  loadingProductId?: string | null;
  activeProductId?: string | null;
  playErrorMessage?: string | null;
  className?: string;
};

function getProductMeta(product: PromoPagePresentationProduct): string {
  const parts: string[] = [];

  const meta = formatProductMeta({
    format: product.format,
    audioCount: product.audio_count ?? 1,
    durationMinutesFallback: product.duration_minutes,
  });

  if (meta) {
    parts.push(meta);
  }

  if (product.access_label) {
    parts.push(product.access_label);
  }

  return parts.join(" · ");
}

function PromoPageCtaButton({
  cta,
  previewMode,
  onCtaClick,
}: {
  cta: PublicPromoPageCtaBlock;
  previewMode: boolean;
  onCtaClick?: () => void;
}) {
  const className =
    "mt-4 inline-flex w-full min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white break-words text-center hover:bg-[#6338b0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] sm:w-auto";

  if (previewMode) {
    return (
      <span className="mt-4 inline-flex w-full min-h-11 items-center justify-center rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] sm:w-auto">
        {cta.label}
      </span>
    );
  }

  if (cta.kind === "internal") {
    return (
      <Link href={cta.href} className={className} onClick={onCtaClick}>
        {cta.label}
      </Link>
    );
  }

  return (
    <a
      href={cta.href}
      className={className}
      target={cta.openInNewTab ? "_blank" : undefined}
      rel={cta.openInNewTab ? "noopener noreferrer" : undefined}
      onClick={onCtaClick}
    >
      {cta.label}
    </a>
  );
}

export default function PromoPagePresentation({
  publicTitle,
  publicDescription,
  footerText,
  cta = null,
  products,
  authorName,
  authorSlug,
  bannerUrl,
  previewMode = false,
  interactiveMode = false,
  onPlayProduct,
  onCtaClick,
  getPlayLabel,
  loadingProductId = null,
  activeProductId = null,
  playErrorMessage = null,
  className = "",
}: PromoPagePresentationProps) {
  const isInteractive = interactiveMode && !previewMode && Boolean(onPlayProduct);

  return (
    <div className={`overflow-hidden rounded-[28px] border border-[#eadff8] bg-[#fbf8ff] ${className}`}>
      {bannerUrl ? (
        <div className="border-b border-[#eadff8]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerUrl}
            alt=""
            className="h-40 w-full object-cover sm:h-48"
          />
        </div>
      ) : null}

      <div className="border-b border-[#eadff8] bg-white px-5 py-6 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9485b4]">
          АудиоЛад
        </p>
        <h1 className="mt-3 text-[26px] font-semibold leading-tight text-[#2f2548] sm:text-[32px]">
          {publicTitle}
        </h1>
        {publicDescription ? (
          <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-[#5f5484]">
            {publicDescription}
          </p>
        ) : null}
        {authorSlug && authorName ? (
          <p className="mt-4 text-sm text-[#7d70a2]">
            Автор:{" "}
            {previewMode ? (
              <span className="font-medium text-[#5f5484]">{authorName}</span>
            ) : (
              <Link
                href={`/authors/${authorSlug}`}
                className="font-medium text-[#7042c5] underline-offset-2 hover:underline"
              >
                {authorName}
              </Link>
            )}
          </p>
        ) : null}
      </div>

      <div className="space-y-4 px-5 py-6 sm:px-8">
        {products.length === 0 ? (
          <p className="rounded-[18px] border border-dashed border-[#d9c9ef] bg-white px-4 py-6 text-center text-sm text-[#7d70a2]">
            {previewMode
              ? "Добавьте от 1 до 3 продуктов, чтобы страница была готова к публикации."
              : "На странице пока нет доступных материалов."}
          </p>
        ) : (
          products.map((product) => {
            const isLoading = loadingProductId === product.practice_id;
            const isActive = activeProductId === product.practice_id;
            const playLabel =
              getPlayLabel?.(product) ??
              (previewMode ? "Начать слушать" : "Начать слушать");

            return (
              <article
                key={product.practice_id}
                className="flex gap-4 rounded-[22px] border border-[#eadff8] bg-white p-4"
              >
                <ProductCoverThumbnail
                  slug={product.slug}
                  title={product.title}
                  coverUrl={product.cover_url ?? null}
                  coverImage={product.cover_image}
                  authorName={authorName}
                  format={product.format}
                  className="h-24 w-24 shrink-0 rounded-[18px] sm:h-28 sm:w-28"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9485b4]">
                    {getDisplayFormat(product.format) ?? "Аудиопрактика"}
                  </p>
                  <h2 className="mt-1 text-[17px] font-semibold leading-snug text-[#2f2548]">
                    {product.title}
                  </h2>
                  <p className="mt-2 text-sm text-[#7d70a2]">
                    {getProductMeta(product)}
                  </p>
                  <button
                    type="button"
                    disabled={previewMode || isLoading}
                    aria-pressed={isActive}
                    onClick={() => {
                      if (isInteractive) {
                        onPlayProduct?.(product);
                      }
                    }}
                    className="mt-4 rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {playLabel}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {playErrorMessage ? (
        <div className="border-t border-[#eadff8] bg-white px-5 py-4 sm:px-8">
          <p className="text-sm text-[#b34f63]" role="alert">
            {playErrorMessage}
          </p>
        </div>
      ) : null}

      {cta ? (
        <section
          className="border-t border-[#eadff8] bg-white px-5 py-6 sm:px-8"
          aria-label="Действие после прослушивания"
        >
          {cta.heading ? (
            <h2 className="text-[20px] font-semibold leading-snug text-[#2f2548] break-words">
              {cta.heading}
            </h2>
          ) : null}
          {cta.description ? (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#5f5484] break-words">
              {cta.description}
            </p>
          ) : null}
          <PromoPageCtaButton
            cta={cta}
            previewMode={previewMode}
            onCtaClick={onCtaClick}
          />
        </section>
      ) : null}

      {footerText ? (
        <div className="border-t border-[#eadff8] bg-white px-5 py-6 sm:px-8">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#5f5484] break-words">
            {footerText}
          </p>
        </div>
      ) : null}
    </div>
  );
}
