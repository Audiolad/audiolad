import type { CatalogSlide } from "@/lib/catalog/dto";
import { normalizeCatalogGallery } from "@/lib/catalog/gallery";
import { getDisplayFormat } from "@/lib/author-products/format";

export type ProductHeroCoverInput = {
  displayUrl: string | null;
  alt: string;
};

export type ProductHeroSlide =
  | {
      type: "cover";
      id: "cover";
      src: string | null;
      alt: string;
    }
  | {
      type: "slide";
      id: string;
      src: string;
      alt: string;
    };

/**
 * Cover is always the first slide. Extra publication_gallery_slides follow
 * in stored position order. A product with no slides is a single cover.
 */
export function buildCoverFirstHeroSlides(
  cover: ProductHeroCoverInput,
  slides: ReadonlyArray<Partial<CatalogSlide> | null | undefined> | null | undefined,
): ProductHeroSlide[] {
  const gallery = normalizeCatalogGallery(slides);
  const coverSlide: ProductHeroSlide = {
    type: "cover",
    id: "cover",
    src: cover.displayUrl,
    alt: cover.alt,
  };

  if (gallery.length === 0) {
    return [coverSlide];
  }

  return [
    coverSlide,
    ...gallery.map((slide) => ({
      type: "slide" as const,
      id: slide.id,
      src: slide.image_url,
      alt: slide.alt || cover.alt,
    })),
  ];
}

export function shouldRenderProductHeroSlider(
  slides: readonly ProductHeroSlide[],
): boolean {
  return slides.length > 1;
}

/** Compact mobile carousel window. Never render one micro-dot per slide. */
export const PRACTICE_HERO_DOT_WINDOW = 5;

export type HeroGalleryDot = {
  index: number;
  active: boolean;
  edge: boolean;
};

/**
 * Sliding window of ~5 dots that tracks the active slide.
 * Edge dots shrink to hint that more slides exist beyond the window.
 */
export function buildWindowedHeroDots(
  activeIndex: number,
  total: number,
  windowSize = PRACTICE_HERO_DOT_WINDOW,
): HeroGalleryDot[] {
  if (total <= 0) {
    return [];
  }

  const size = Math.max(1, Math.min(windowSize, total));
  const current = Math.min(total - 1, Math.max(0, activeIndex));

  if (total <= size) {
    return Array.from({ length: total }, (_, index) => ({
      index,
      active: index === current,
      edge: false,
    }));
  }

  const half = Math.floor(size / 2);
  const start = Math.max(0, Math.min(current - half, total - size));

  return Array.from({ length: size }, (_, offset) => {
    const index = start + offset;
    const atWindowStart = offset === 0 && start > 0;
    const atWindowEnd = offset === size - 1 && start + size < total;
    return {
      index,
      active: index === current,
      edge: (atWindowStart || atWindowEnd) && index !== current,
    };
  });
}

export function formatMaterialsCountLabel(count: number): string {
  const abs = Math.abs(Math.trunc(count)) % 100;
  const last = abs % 10;
  let word = "материалов";

  if (abs > 10 && abs < 20) {
    word = "материалов";
  } else if (last === 1) {
    word = "материал";
  } else if (last >= 2 && last <= 4) {
    word = "материала";
  }

  return `${count} ${word}`;
}

export function inferMaterialsFormatLabel(
  alts: ReadonlyArray<string | null | undefined>,
): string | null {
  const joined = alts
    .map((alt) => alt?.toLowerCase() ?? "")
    .filter(Boolean);

  if (joined.length === 0) {
    return null;
  }

  const hasPdf = joined.some((alt) => alt.includes("pdf"));
  const hasAudio = joined.some((alt) => alt.includes("аудио"));

  if (hasPdf && hasAudio) {
    return "PDF и аудио";
  }

  if (hasPdf) {
    return "PDF";
  }

  if (hasAudio) {
    return "аудио";
  }

  return null;
}

export function formatHeroMaterialsMeta(
  slides: ReadonlyArray<{ alt?: string | null } | null | undefined> | null | undefined,
): string | null {
  if (!Array.isArray(slides) || slides.length === 0) {
    return null;
  }

  const countLabel = formatMaterialsCountLabel(slides.length);
  const formatLabel = inferMaterialsFormatLabel(slides.map((slide) => slide?.alt));

  if (formatLabel) {
    return `${countLabel} · ${formatLabel}`;
  }

  return countLabel;
}

export function stripRedundantFormatPrefix(
  meta: string | null | undefined,
  productTypeLabel: string | null | undefined,
): string | null {
  const trimmedMeta = meta?.trim() || null;
  const trimmedType = getDisplayFormat(productTypeLabel);

  if (!trimmedMeta) {
    return null;
  }

  if (trimmedType && trimmedMeta === trimmedType) {
    return null;
  }

  if (trimmedType && trimmedMeta.startsWith(`${trimmedType} · `)) {
    const rest = trimmedMeta.slice(trimmedType.length + 3).trim();
    return rest || null;
  }

  return trimmedMeta;
}

export function buildPracticeHeroLightMeta(input: {
  gallerySlides: ReadonlyArray<{ alt?: string | null } | null | undefined> | null | undefined;
  productTypeLabel: string | null | undefined;
  formatMeta: string | null | undefined;
  authorName?: string | null;
}): string | null {
  const lightMeta =
    formatHeroMaterialsMeta(input.gallerySlides) ??
    stripRedundantFormatPrefix(input.formatMeta, input.productTypeLabel);
  const author = input.authorName?.trim() || null;

  if (author && lightMeta) {
    return `${author} · ${lightMeta}`;
  }

  return author ?? lightMeta;
}

/** Single-paragraph description may stand in when subtitle is empty. */
export function resolvePracticeHeroSubtitle(
  subtitle: string | null | undefined,
  description: string | null | undefined,
): string | null {
  const trimmedSubtitle = subtitle?.trim() || null;

  if (trimmedSubtitle) {
    return trimmedSubtitle;
  }

  const trimmedDescription = description?.trim() || "";

  if (!trimmedDescription) {
    return null;
  }

  if (trimmedDescription.includes("\n\n") || trimmedDescription.length > 240) {
    return null;
  }

  return trimmedDescription;
}

export function isHeroPromoOfferActive(offer: {
  basePrice: number;
  salePrice: number | null;
  endsAt: string | null;
  expiresAt: string | null;
} | null): boolean {
  if (!offer || typeof offer.salePrice !== "number") {
    return false;
  }

  if (!(offer.salePrice > 0) || !(offer.salePrice < offer.basePrice)) {
    return false;
  }

  const deadline = offer.expiresAt ?? offer.endsAt;

  if (!deadline) {
    return false;
  }

  const remaining = new Date(deadline).getTime() - Date.now();
  return Number.isFinite(remaining) && remaining > 0;
}
