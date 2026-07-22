import { resolveProductCoverUrl } from "@/lib/images/resolve-display";
import { buildProductCoverAlt } from "@/lib/seo/cover-alt";
import { getAppOrigin } from "@/lib/seo/app-origin";
import type { PublicPromoPageProductDto } from "@/lib/promo-pages/types";

/** Neutral brand square — not the author-acquisition CTA banner. */
export const PROMO_PAGE_SOCIAL_FALLBACK_IMAGE_PATH = "/icon-512.png";

export type PromoSocialPreviewImage = {
  url: string;
  alt: string;
  source: "practice_cover" | "fallback";
  practiceId: string | null;
};

type PromoSocialCoverCandidate = Pick<
  PublicPromoPageProductDto,
  "practice_id" | "title" | "format" | "cover_url" | "cover_image" | "position"
> & {
  author_name?: string | null;
};

function looksLikeSignedUrl(url: string): boolean {
  const lower = url.toLowerCase();

  return (
    lower.includes("token=") ||
    lower.includes("x-amz-") ||
    lower.includes("signature=") ||
    lower.includes("sig=") ||
    lower.includes("/object/sign/")
  );
}

/**
 * Normalize a cover candidate to an absolute public HTTPS URL suitable for OG bots.
 * Rejects signed/private URLs.
 */
export function toAbsolutePublicHttpsImageUrl(
  candidate: string | null | undefined,
  origin: string = getAppOrigin(),
): string | null {
  const trimmed = candidate?.trim();

  if (!trimmed) {
    return null;
  }

  if (looksLikeSignedUrl(trimmed)) {
    return null;
  }

  try {
    if (trimmed.startsWith("/")) {
      return `${origin.replace(/\/$/, "")}${trimmed}`;
    }

    const parsed = new URL(trimmed);

    if (parsed.protocol !== "https:") {
      return null;
    }

    if (
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost"
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function resolvePromoPageSocialPreviewImage(
  products: readonly PromoSocialCoverCandidate[],
  options?: {
    publicTitle?: string | null;
    origin?: string;
  },
): PromoSocialPreviewImage {
  const origin = options?.origin ?? getAppOrigin();
  const ordered = [...products].sort((left, right) => left.position - right.position);

  for (const product of ordered) {
    const resolved = resolveProductCoverUrl(
      {
        cover_url: product.cover_url,
        cover_image: product.cover_image,
      },
      1200,
      "lg",
    );

    const absolute = toAbsolutePublicHttpsImageUrl(resolved, origin);

    if (!absolute) {
      continue;
    }

    return {
      url: absolute,
      alt: buildProductCoverAlt({
        title: product.title,
        authorName: product.author_name,
        format: product.format,
      }),
      source: "practice_cover",
      practiceId: product.practice_id,
    };
  }

  const fallbackTitle = options?.publicTitle?.trim() || "АудиоЛад";

  return {
    url: toAbsolutePublicHttpsImageUrl(
      PROMO_PAGE_SOCIAL_FALLBACK_IMAGE_PATH,
      origin,
    )!,
    alt: `АудиоЛад — ${fallbackTitle}`,
    source: "fallback",
    practiceId: null,
  };
}
