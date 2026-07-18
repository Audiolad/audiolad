import { buildCoverDisplayUrl } from "@/lib/author-products/utils";
import {
  buildImageSrcSetFromManifest,
  resolvePracticeCoverPublicUrl,
} from "@/lib/images/image-url";
import {
  parseImageManifest,
  sanitizePublicImageManifest,
} from "@/lib/images/image-manifest";
import { resolveProductCoverUrl } from "@/lib/images/resolve-display";
import type { ImageManifest, ImageVariantKey } from "@/lib/images/image-types";

const coverGradients = [
  "from-[#f0d9ff] via-[#dec4ff] to-[#c9b6f4]",
  "from-[#ffe0ed] via-[#f4c7e3] to-[#d7b9ef]",
  "from-[#dff4eb] via-[#ccebdc] to-[#b9ddcf]",
  "from-[#fff0d2] via-[#f5dfbb] to-[#e4cfa8]",
  "from-[#e8f0ff] via-[#d4e2ff] to-[#b8c9ef]",
];

const slugSymbols: Record<string, string> = {
  "elixir-molodosti": "❀",
  "klyuch-k-izobiliyu": "⚿",
  "kod-prityazheniya": "✦",
  "personal-boundaries": "◯",
};

const fallbackSymbols = ["♡", "☼", "✧", "❈"];

function stableHash(input: string): number {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash;
}

export function getProductCoverGradient(slug: string): string {
  return coverGradients[stableHash(slug) % coverGradients.length];
}

export function getProductCoverSymbol(slug: string): string {
  if (slugSymbols[slug]) {
    return slugSymbols[slug];
  }

  return fallbackSymbols[stableHash(slug) % fallbackSymbols.length];
}

export type ProductCoverFields = {
  /** Legacy public URL from DB (`cover_url`). */
  coverUrl: string | null;
  /** Optimized variants manifest (`cover_image` JSONB). */
  coverImage?: unknown;
  updatedAt?: string | null;
};

export function mapProductCoverFields(row: CoverDisplayRow): ProductCoverFields {
  return {
    coverUrl: row.cover_url?.trim() || null,
    coverImage: row.cover_image ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export type CoverDisplayRow = {
  cover_url?: string | null;
  cover_image?: unknown;
  updated_at?: string | null;
};

export function getProductCoverDisplayUrl(
  coverUrl: string | null | undefined,
  updatedAt: string | null | undefined,
  coverImage?: unknown,
  displayWidth = 168,
  variant?: ImageVariantKey,
): string | null {
  return resolveProductCoverUrl(
    {
      cover_url: coverUrl,
      cover_image: coverImage,
      updated_at: updatedAt,
    },
    displayWidth,
    variant,
  );
}

export function getProductCoverPlaceholder(
  coverImage: unknown,
): string | null {
  const manifest = parseImageManifest(coverImage);
  return manifest?.placeholderBlurDataUrl?.trim() || null;
}

export type PlaybackCoverPractice = CoverDisplayRow & {
  use_shared_cover?: boolean | null;
};

export type PlaybackCoverTrack = CoverDisplayRow;

export function resolvePlaybackCoverUrl(
  practice: PlaybackCoverPractice,
  track: PlaybackCoverTrack | null | undefined,
  displayWidth = 360,
): string | null {
  if (
    practice.use_shared_cover === false &&
    track?.cover_url?.trim()
  ) {
    return getProductCoverDisplayUrl(
      track.cover_url,
      track.updated_at,
      track.cover_image,
      displayWidth,
    );
  }

  return getProductCoverDisplayUrl(
    practice.cover_url,
    practice.updated_at,
    practice.cover_image,
    displayWidth,
  );
}

export function resolvePlaybackCoverFields(
  practice: PlaybackCoverPractice,
  track: PlaybackCoverTrack | null | undefined,
): ProductCoverFields {
  if (practice.use_shared_cover === false && track?.cover_url?.trim()) {
    return mapProductCoverFields(track);
  }

  return mapProductCoverFields(practice);
}

export function buildProductCoverResponsiveProps(
  coverUrl: string | null | undefined,
  coverImage: unknown,
  updatedAt: string | null | undefined,
  displayWidth: number,
  variant?: ImageVariantKey,
): {
  src: string | null;
  manifest: ImageManifest | null;
  srcSet: string | null;
  sizes: string;
} {
  const manifest = sanitizePublicImageManifest(coverImage);
  const src = getProductCoverDisplayUrl(
    coverUrl,
    updatedAt,
    coverImage,
    displayWidth,
    variant,
  );
  const srcSet = manifest
    ? buildImageSrcSetFromManifest(manifest, resolvePracticeCoverPublicUrl)
    : null;

  return {
    src,
    manifest,
    srcSet,
    sizes: `${displayWidth}px`,
  };
}

export { buildCoverDisplayUrl };
