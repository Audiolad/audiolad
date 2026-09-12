import { validatePaidPriceRubles } from "@/lib/pricing/money";

/**
 * Keeps a money input editable while its contents are temporarily incomplete.
 * Persisted product prices remain integer rubles.
 */
export function parsePriceInputDraft(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const rubles = Number(value);

  return Number.isSafeInteger(rubles) ? rubles : null;
}

export function validatePaidPriceInputDraft(
  value: string,
): { ok: true; rubles: number } | { ok: false } {
  const rubles = parsePriceInputDraft(value);

  if (rubles === null || !validatePaidPriceRubles(rubles).ok) {
    return { ok: false };
  }

  return { ok: true, rubles };
}

export function buildAuthorProductPriceFields(input: {
  productKind: string;
  isFree: boolean;
  price: number;
  musicUsagePermission: string | null;
  studioMusicPricingMode: string | null;
  studioMusicPriceRubles: number;
}) {
  return {
    studio_music_price:
      input.productKind === "music" &&
      input.musicUsagePermission === "platform_reuse_allowed" &&
      input.studioMusicPricingMode === "fixed"
        ? input.studioMusicPriceRubles
        : null,
    price: input.productKind === "audio_post" || input.isFree ? 0 : input.price,
  };
}
