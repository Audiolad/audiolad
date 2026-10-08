import type {
  MaxProductContentTrack,
  MaxProductGallerySlide,
  MaxProductRatingView,
} from "@/lib/max/product-view";
import { readMiniAppNextStep, type MiniAppNextStep } from "@/lib/mini-app/next-step";

export type VkProductAppreciation = {
  authorName: string;
};

export type VkProductView = {
  authorSlug: string;
  productSlug: string;
  title: string;
  subtitle: string | null;
  formatLabel: string;
  coverUrl: string | null;
  metaLine: string | null;
  priceLabel: string;
  isFree: boolean;
  appreciation: VkProductAppreciation | null;
  /** Canonical public aggregate. VK has no verified identity: read-only here. */
  rating: MaxProductRatingView;
  /** Author-saved «Следующий шаг» (audio_post only); null hides the block. */
  nextStep: MiniAppNextStep | null;
  gallery: MaxProductGallerySlide[];
  contents: MaxProductContentTrack[];
};

const DISABLED_RATING: MaxProductRatingView = {
  enabled: false,
  aggregate: { totalStars: 0, ratingCount: 0 },
};

const LEAKED_KEYS = [
  "practiceId",
  "practice_id",
  "authorId",
  "author_id",
  "audio_path",
  "audio_url",
  "storage_path",
  "storagePath",
  "description",
] as const;

const GALLERY_LEAKED_KEYS = [
  ...LEAKED_KEYS,
  "publication_id",
  "publicationId",
  "image_manifest",
  "imageManifest",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

function publicCommerce(product: {
  priceLabel?: string | null;
  isFree?: boolean | null;
}): { priceLabel: string; isFree: boolean } {
  const priceLabel = typeof product.priceLabel === "string" ? product.priceLabel.trim() : "";
  if (product.isFree === false) return { priceLabel, isFree: false };
  return { priceLabel: priceLabel || "Подарок", isFree: true };
}

function publicAppreciation(
  value: { authorName?: string | null } | null | undefined,
): VkProductAppreciation | null {
  const authorName = value?.authorName?.trim() ?? "";
  if (!authorName) return null;
  return { authorName };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function publicRating(
  value: {
    enabled?: boolean | null;
    aggregate?: { totalStars?: number | null; ratingCount?: number | null } | null;
  } | null | undefined,
): MaxProductRatingView {
  const totalStars = value?.aggregate?.totalStars;
  const ratingCount = value?.aggregate?.ratingCount;
  if (
    value?.enabled !== true ||
    !isNonNegativeInteger(totalStars) ||
    !isNonNegativeInteger(ratingCount)
  ) {
    return DISABLED_RATING;
  }
  return { enabled: true, aggregate: { totalStars, ratingCount } };
}

function readVkRating(value: unknown): MaxProductRatingView | null {
  if (value == null) return DISABLED_RATING;
  if (!isRecord(value)) return null;
  if (Object.keys(value).some((key) => key !== "enabled" && key !== "aggregate")) return null;
  const aggregate = value.aggregate;
  if (typeof value.enabled !== "boolean" || !isRecord(aggregate)) return null;
  if (
    Object.keys(aggregate).some((key) => key !== "totalStars" && key !== "ratingCount")
  ) {
    return null;
  }
  if (!isNonNegativeInteger(aggregate.totalStars) || !isNonNegativeInteger(aggregate.ratingCount)) {
    return null;
  }
  return {
    enabled: value.enabled,
    aggregate: { totalStars: aggregate.totalStars, ratingCount: aggregate.ratingCount },
  };
}

function publicGallery(
  slides: readonly {
    id?: string | null;
    image_url?: string | null;
    alt?: string | null;
  }[] | null | undefined,
): MaxProductGallerySlide[] {
  if (!Array.isArray(slides)) return [];
  return slides.flatMap((slide) => {
    const id = slide?.id?.trim() ?? "";
    const imageUrl = slide?.image_url?.trim() ?? "";
    if (!id || !imageUrl) return [];
    return [{
      id,
      image_url: imageUrl,
      alt: typeof slide.alt === "string" ? slide.alt : "",
    }];
  });
}

export function toVkProductView(product: {
  authorSlug: string;
  productSlug: string;
  title: string;
  subtitle: string | null;
  formatLabel: string;
  coverUrl: string | null;
  metaLine: string | null;
  contents: readonly MaxProductContentTrack[];
  priceLabel?: string | null;
  isFree?: boolean | null;
  appreciation?: { authorName?: string | null } | null;
  rating?: {
    enabled?: boolean | null;
    aggregate?: { totalStars?: number | null; ratingCount?: number | null } | null;
  } | null;
  nextStep?: unknown;
  gallery?: readonly {
    id?: string | null;
    image_url?: string | null;
    alt?: string | null;
  }[] | null;
}): VkProductView {
  const commerce = publicCommerce(product);
  return {
    authorSlug: product.authorSlug,
    productSlug: product.productSlug,
    title: product.title,
    subtitle: product.subtitle,
    formatLabel: product.formatLabel,
    coverUrl: product.coverUrl,
    metaLine: product.metaLine,
    priceLabel: commerce.priceLabel,
    isFree: commerce.isFree,
    appreciation: publicAppreciation(product.appreciation),
    rating: publicRating(product.rating),
    nextStep: readMiniAppNextStep(product.nextStep),
    gallery: publicGallery(product.gallery),
    contents: product.contents.map((track) => ({
      audioItemId: track.audioItemId,
      title: track.title,
      position: track.position,
      durationSeconds: track.durationSeconds,
    })),
  };
}

export function readVkProductView(value: unknown): VkProductView | null {
  if (!isRecord(value)) return null;
  if (LEAKED_KEYS.some((key) => key in value)) return null;

  const authorSlug = readString(value.authorSlug)?.trim() ?? "";
  const productSlug = readString(value.productSlug)?.trim() ?? "";
  const title = readString(value.title)?.trim() ?? "";
  const formatLabel = readString(value.formatLabel);
  const subtitle = readNullableString(value.subtitle);
  const coverUrl = readNullableString(value.coverUrl);
  const metaLine = readNullableString(value.metaLine);
  const priceLabel = readString(value.priceLabel)?.trim() ?? "";
  if (
    !authorSlug ||
    !productSlug ||
    !title ||
    formatLabel === null ||
    subtitle === undefined ||
    coverUrl === undefined ||
    metaLine === undefined ||
    typeof value.isFree !== "boolean" ||
    (value.isFree && !priceLabel) ||
    !Array.isArray(value.contents)
  ) {
    return null;
  }

  const gallery = readVkProductGallery(value.gallery);
  if (!gallery) return null;

  let appreciation: VkProductAppreciation | null = null;
  if (value.appreciation != null) {
    const rawAppreciation = value.appreciation;
    if (!isRecord(rawAppreciation)) return null;
    if (LEAKED_KEYS.some((key) => key in rawAppreciation)) return null;
    if (Object.keys(rawAppreciation).some((key) => key !== "authorName")) return null;
    const authorName = readString(rawAppreciation.authorName)?.trim() ?? "";
    if (!authorName) return null;
    appreciation = { authorName };
  }

  const rating = readVkRating(value.rating);
  if (!rating) return null;

  const contents = value.contents.flatMap((track) => {
    if (!isRecord(track)) return [];
    if (LEAKED_KEYS.some((key) => key in track)) return [];
    const audioItemId = readString(track.audioItemId)?.trim() ?? "";
    const trackTitle = readString(track.title)?.trim() ?? "";
    const position = track.position;
    const durationSeconds = track.durationSeconds;
    if (!audioItemId || !trackTitle || typeof position !== "number") return [];
    if (durationSeconds !== null && typeof durationSeconds !== "number") return [];
    return [{
      audioItemId,
      title: trackTitle,
      position,
      durationSeconds: durationSeconds === null ? null : durationSeconds,
    }];
  });
  if (contents.length !== value.contents.length) return null;

  return {
    authorSlug,
    productSlug,
    title,
    subtitle,
    formatLabel,
    coverUrl,
    metaLine,
    priceLabel,
    isFree: value.isFree,
    appreciation,
    rating,
    nextStep: readMiniAppNextStep(value.nextStep),
    gallery,
    contents,
  };
}

function readVkProductGallery(value: unknown): MaxProductGallerySlide[] | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  const gallery = value.flatMap((slide) => {
    if (!isRecord(slide)) return [];
    if (GALLERY_LEAKED_KEYS.some((key) => key in slide)) return [];
    const id = readString(slide.id)?.trim() ?? "";
    const imageUrl = readString(slide.image_url)?.trim() ?? "";
    const alt = readString(slide.alt);
    if (!id || !imageUrl || alt === null) return [];
    return [{ id, image_url: imageUrl, alt }];
  });
  if (gallery.length !== value.length) return null;
  return gallery;
}
