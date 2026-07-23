import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PromoPublicPageClient from "@/components/promo-pages/PromoPublicPageClient";
import JsonLd from "@/components/seo/JsonLd";
import {
  buildPromoPageCanonicalUrl,
  buildPromoPagePath,
} from "@/lib/promo-pages/paths";
import { buildPromoPageJsonLd } from "@/lib/seo/json-ld";
import { loadPublicPromoPageCached } from "@/lib/promo-pages/public-page";
import { resolvePromoPageSocialPreviewImage } from "@/lib/promo-pages/social-preview";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ authorSlug: string; promoSlug: string }>;
};

function buildSafeDescription(
  publicDescription: string | null | undefined,
  publicTitle: string,
): string {
  const trimmed = publicDescription?.trim();

  if (trimmed) {
    return trimmed.slice(0, 160);
  }

  return `Аудиопрактики на промостранице «${publicTitle}» на АудиоЛаде.`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { authorSlug, promoSlug } = await params;
  const normalizedAuthorSlug = authorSlug.trim();
  const normalizedPromoSlug = promoSlug.trim();

  if (!normalizedAuthorSlug || !normalizedPromoSlug) {
    return {
      title: "Промостраница – АудиоЛад",
      robots: { index: false, follow: false },
    };
  }

  const supabase = await createClient();
  const loaded = await loadPublicPromoPageCached(
    supabase,
    normalizedAuthorSlug,
    normalizedPromoSlug,
  );

  if (!loaded.ok) {
    return {
      title: "Промостраница – АудиоЛад",
      robots: { index: false, follow: false },
    };
  }

  const { page } = loaded;
  const canonical = buildPromoPageCanonicalUrl(page.author_slug, page.slug);
  const title = `${page.public_title} — АудиоЛад`;
  const description = buildSafeDescription(
    page.public_description,
    page.public_title,
  );
  const previewImage = resolvePromoPageSocialPreviewImage(page.products, {
    publicTitle: page.public_title,
  });
  const socialImages = [{ url: previewImage.url, alt: previewImage.alt }];

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      siteName: "АудиоЛад",
      images: socialImages,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: socialImages,
    },
  };
}

export default async function PublicPromoPage({ params }: PageProps) {
  const { authorSlug, promoSlug } = await params;
  const normalizedAuthorSlug = authorSlug.trim();
  const normalizedPromoSlug = promoSlug.trim();

  if (!normalizedAuthorSlug || !normalizedPromoSlug) {
    notFound();
  }

  const supabase = await createClient();
  const loaded = await loadPublicPromoPageCached(
    supabase,
    normalizedAuthorSlug,
    normalizedPromoSlug,
  );

  if (!loaded.ok) {
    if (loaded.reason === "not_found") {
      notFound();
    }

    return (
      <div className="px-5 py-8 xl:px-8">
        <h1 className="text-2xl font-semibold text-[#2f2548]">Промостраница</h1>
        <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
          Не удалось загрузить страницу. Попробуйте обновить её позже.
        </p>
      </div>
    );
  }

  const expectedPath = buildPromoPagePath(
    loaded.page.author_slug,
    loaded.page.slug,
  );
  const requestPath = buildPromoPagePath(normalizedAuthorSlug, normalizedPromoSlug);

  if (expectedPath !== requestPath) {
    notFound();
  }

  return (
    <>
      <JsonLd
        data={buildPromoPageJsonLd({
          title: loaded.page.public_title,
          description: loaded.page.public_description,
          authorSlug: loaded.page.author_slug,
          promoSlug: loaded.page.slug,
          products: loaded.page.products.map((product) => ({
            title: product.title,
            authorSlug: product.author_slug,
            productSlug: product.slug,
            position: product.position,
          })),
        })}
      />
      <PromoPublicPageClient page={loaded.page} bannerUrl={loaded.bannerUrl} />
    </>
  );
}
