import { resolveProductCoverUrl } from "@/lib/images/resolve-display";
import {
  PROMO_PAGE_SOCIAL_FALLBACK_IMAGE_PATH,
  toAbsolutePublicHttpsImageUrl,
} from "@/lib/promo-pages/social-preview";
import { getAppOrigin } from "@/lib/seo/app-origin";
import { buildProductCoverAlt } from "@/lib/seo/cover-alt";

export type PracticeSocialPreviewImage = {
  url: string;
  alt: string;
  source: "practice_cover" | "fallback";
};

export type PracticeSocialCoverInput = {
  title: string;
  cover_url?: string | null;
  cover_image?: unknown;
  format?: string | null;
  productKind?: string | null;
  authorName?: string | null;
};

export type PracticePdpSocialTags = {
  openGraph: {
    title: string;
    description: string;
    url: string;
    images: Array<{ url: string; alt: string }>;
  };
  twitter: {
    card: "summary_large_image";
    title: string;
    description: string;
    images: Array<{ url: string; alt: string }>;
  };
};

/**
 * Public crawlable OG/Twitter image for a practice PDP.
 * Reuses the promo-page HTTPS guard: signed, token, and localhost URLs fall back.
 */
export function resolvePracticeSocialPreviewImage(
  practice: PracticeSocialCoverInput,
  origin: string = getAppOrigin(),
): PracticeSocialPreviewImage {
  const resolved = resolveProductCoverUrl(
    {
      cover_url: practice.cover_url,
      cover_image: practice.cover_image,
    },
    1200,
    "lg",
  );
  const absolute = toAbsolutePublicHttpsImageUrl(resolved, origin);

  if (absolute) {
    return {
      url: absolute,
      alt: buildProductCoverAlt({
        title: practice.title,
        authorName: practice.authorName,
        format: practice.format,
        productKind: practice.productKind,
      }),
      source: "practice_cover",
    };
  }

  return {
    url: toAbsolutePublicHttpsImageUrl(
      PROMO_PAGE_SOCIAL_FALLBACK_IMAGE_PATH,
      origin,
    )!,
    alt: buildProductCoverAlt({
      title: practice.title,
      authorName: practice.authorName,
      format: practice.format,
      productKind: practice.productKind,
    }),
    source: "fallback",
  };
}

/** OG/Twitter tags for the 2-segment public practice PDP. */
export function buildPracticePdpSocialTags(input: {
  productTitle: string;
  description: string;
  canonical: string;
  cover_url?: string | null;
  cover_image?: unknown;
  format?: string | null;
  productKind?: string | null;
  authorName?: string | null;
}): PracticePdpSocialTags {
  const preview = resolvePracticeSocialPreviewImage({
    title: input.productTitle,
    cover_url: input.cover_url,
    cover_image: input.cover_image,
    format: input.format,
    productKind: input.productKind,
    authorName: input.authorName,
  });
  const socialImages = [{ url: preview.url, alt: preview.alt }];

  return {
    openGraph: {
      title: input.productTitle,
      description: input.description,
      url: input.canonical,
      images: socialImages,
    },
    twitter: {
      card: "summary_large_image",
      title: input.productTitle,
      description: input.description,
      images: socialImages,
    },
  };
}
