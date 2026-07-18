import type { ReactNode } from "react";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";

type CoverOverlayCardProps = {
  slug: string;
  title: string;
  coverUrl: string | null;
  coverImage?: unknown;
  updatedAt?: string | null;
  authorName?: string | null;
  format?: string | null;
  className?: string;
  children: ReactNode;
};

export default function CoverOverlayCard({
  slug,
  title,
  coverUrl,
  coverImage,
  updatedAt,
  authorName,
  format,
  className = "",
  children,
}: CoverOverlayCardProps) {
  return (
    <article
      className={`relative isolate overflow-hidden rounded-[28px] shadow-[0_12px_30px_rgba(91,62,145,0.12)] xl:rounded-[24px] xl:shadow-[0_8px_22px_rgba(91,62,145,0.08)] ${className}`}
    >
      <div className="absolute inset-0" aria-hidden="true">
        <ProductCoverThumbnail
          slug={slug}
          title={title}
          coverUrl={coverUrl}
          coverImage={coverImage}
          updatedAt={updatedAt}
          authorName={authorName}
          format={format}
          displayWidth={640}
          priority
          className="h-full w-full rounded-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#25135c]/92 via-[#25135c]/55 to-[#25135c]/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#25135c]/65 via-[#25135c]/20 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(37,19,92,0)_0%,rgba(37,19,92,0.35)_100%)]" />
      </div>

      <div className="relative z-10 flex min-h-[340px] flex-col p-5 sm:min-h-[320px] lg:min-h-[300px] xl:min-h-[252px] xl:p-5">
        {children}
      </div>
    </article>
  );
}
