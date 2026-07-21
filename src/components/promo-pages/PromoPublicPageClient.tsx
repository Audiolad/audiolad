"use client";

import Link from "next/link";
import { useMemo } from "react";

import PromoPagePresentation, {
  type PromoPagePresentationProduct,
} from "@/components/promo-pages/PromoPagePresentation";
import {
  getPromoProductPlayLabel,
  usePromoPagePlayback,
} from "@/components/promo-pages/usePromoPagePlayback";
import type { PublicPromoPageDto } from "@/lib/promo-pages/types";
import { buildAuthorPageCtaPreset } from "@/lib/promo-pages/paths";

type PromoPublicPageClientProps = {
  page: PublicPromoPageDto;
  bannerUrl: string | null;
};

function mapProducts(page: PublicPromoPageDto): PromoPagePresentationProduct[] {
  return page.products.map((product) => ({
    practice_id: product.practice_id,
    slug: product.slug,
    title: product.title,
    format: product.format,
    duration_minutes: product.duration_minutes,
    cover_url: product.cover_url,
    cover_image: product.cover_image,
  }));
}

export default function PromoPublicPageClient({
  page,
  bannerUrl,
}: PromoPublicPageClientProps) {
  const {
    playProduct,
    loadingProductId,
    errorMessage,
    clearErrorMessage,
    activePracticeId,
  } = usePromoPagePlayback({ authorSlug: page.author_slug });

  const products = useMemo(() => mapProducts(page), [page]);
  const authorName = page.products[0]?.author_name ?? null;
  const authorSlug = page.author_slug;

  const ctaPreset = buildAuthorPageCtaPreset(authorSlug);
  const ctaLabel = page.cta_label?.trim() || ctaPreset.label;
  const ctaHref = page.cta_href?.trim() || ctaPreset.href;

  return (
    <div className="px-5 py-6 xl:px-8 xl:py-8">
      {authorSlug ? (
        <Link
          href={`/authors/${authorSlug}`}
          className="mb-4 inline-flex text-sm font-medium text-[#7042c5] underline-offset-2 hover:underline"
        >
          ← Профиль автора
        </Link>
      ) : null}

      <PromoPagePresentation
        publicTitle={page.public_title}
        publicDescription={page.public_description}
        footerText={page.footer_text}
        ctaLabel={ctaLabel}
        ctaHref={ctaHref}
        products={products}
        authorName={authorName}
        authorSlug={authorSlug}
        bannerUrl={bannerUrl}
        interactiveMode
        onPlayProduct={(product) => {
          clearErrorMessage();
          void playProduct(product.slug, product.practice_id);
        }}
        getPlayLabel={(product) =>
          getPromoProductPlayLabel(
            product.practice_id,
            activePracticeId,
            loadingProductId === product.practice_id,
          )
        }
        loadingProductId={loadingProductId}
        activeProductId={activePracticeId}
        playErrorMessage={errorMessage}
      />
    </div>
  );
}
