import Link from "next/link";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { getDisplayFormat } from "@/lib/author-products/format";
import { formatProductMeta } from "@/lib/products/duration";

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
  ctaLabel?: string | null;
  ctaHref?: string | null;
  products: PromoPagePresentationProduct[];
  authorName?: string | null;
  previewMode?: boolean;
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

export default function PromoPagePresentation({
  publicTitle,
  publicDescription,
  footerText,
  ctaLabel,
  ctaHref,
  products,
  authorName,
  previewMode = false,
  className = "",
}: PromoPagePresentationProps) {
  const showCta = Boolean(ctaLabel?.trim() && ctaHref?.trim());

  return (
    <div className={`overflow-hidden rounded-[28px] border border-[#eadff8] bg-[#fbf8ff] ${className}`}>
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
      </div>

      <div className="space-y-4 px-5 py-6 sm:px-8">
        {products.length === 0 ? (
          <p className="rounded-[18px] border border-dashed border-[#d9c9ef] bg-white px-4 py-6 text-center text-sm text-[#7d70a2]">
            Добавьте от 1 до 3 продуктов, чтобы страница была готова к публикации.
          </p>
        ) : (
          products.map((product) => (
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
                <p className="mt-2 text-sm text-[#7d70a2]">{getProductMeta(product)}</p>
                <button
                  type="button"
                  disabled={previewMode}
                  className="mt-4 rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {previewMode ? "Начать слушать" : "Начать слушать"}
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {(footerText || showCta) && (
        <div className="border-t border-[#eadff8] bg-white px-5 py-6 sm:px-8">
          {footerText ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#5f5484]">
              {footerText}
            </p>
          ) : null}
          {showCta ? (
            previewMode ? (
              <span className="mt-4 inline-flex rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]">
                {ctaLabel}
              </span>
            ) : (
              <Link
                href={ctaHref ?? "#"}
                className="mt-4 inline-flex rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
              >
                {ctaLabel}
              </Link>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}
