import { buildCoverDisplayUrl } from "@/lib/author-products/utils";

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

export function getProductCoverDisplayUrl(
  coverUrl: string | null | undefined,
  updatedAt: string | null | undefined,
): string | null {
  return buildCoverDisplayUrl(coverUrl, updatedAt);
}

export type PlaybackCoverPractice = {
  cover_url: string | null | undefined;
  updated_at: string | null | undefined;
  use_shared_cover: boolean | null | undefined;
};

export type PlaybackCoverTrack = {
  cover_url: string | null | undefined;
  updated_at: string | null | undefined;
};

export function resolvePlaybackCoverUrl(
  practice: PlaybackCoverPractice,
  track: PlaybackCoverTrack | null | undefined,
): string | null {
  if (
    practice.use_shared_cover === false &&
    track?.cover_url?.trim()
  ) {
    return buildCoverDisplayUrl(track.cover_url, track.updated_at);
  }

  return buildCoverDisplayUrl(practice.cover_url, practice.updated_at);
}
