import type { MaxProductContentTrack } from "@/lib/max/product-view";

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
  contents: MaxProductContentTrack[];
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
    contents,
  };
}
