import {
  MIN_PAID_PRICE_RUB,
  rublesToMinor,
  validatePaidPriceRubles,
} from "@/lib/pricing/money";
import { formatRubles } from "@/lib/products/price-format";

import {
  canAcquireStudioMusic,
  studioLicenseAmountMinor,
  type StudioMusicPublicationInput,
} from "./access";

export const STUDIO_MUSIC_PRICING_MODE = {
  FREE: "free",
  AUTO_2X_LISTENER: "auto_2x_listener",
  FIXED: "fixed",
} as const;

export type StudioMusicPricingMode =
  (typeof STUDIO_MUSIC_PRICING_MODE)[keyof typeof STUDIO_MUSIC_PRICING_MODE];

export const STUDIO_MUSIC_ACQUISITION_STATUS = {
  UNAVAILABLE: "unavailable",
  FREE: "free",
  PAID: "paid",
} as const;

export type StudioMusicAcquisitionStatus =
  (typeof STUDIO_MUSIC_ACQUISITION_STATUS)[keyof typeof STUDIO_MUSIC_ACQUISITION_STATUS];

export type StudioMusicPricedPublication = StudioMusicPublicationInput & {
  studio_music_pricing_mode?: string | null;
  studio_music_price_minor?: number | null;
};

export type StudioMusicAcquisition = {
  status: StudioMusicAcquisitionStatus;
  pricing_mode: StudioMusicPricingMode | null;
  studio_is_free: boolean;
  amount_minor: number | null;
  listener_is_free: boolean;
  listener_effective_minor: number | null;
};

export const STUDIO_MUSIC_PRICING_ERROR = {
  INVALID_MODE: "invalid_studio_music_pricing_mode",
  INVALID_PRICE: "invalid_studio_music_price",
  AUTO_NOT_ALLOWED_FOR_FREE_LISTENER: "studio_music_auto_not_allowed",
  MODE_REQUIRED: "studio_music_pricing_mode_required",
} as const;

const STUDIO_MUSIC_PRICING_MODES = new Set<string>(
  Object.values(STUDIO_MUSIC_PRICING_MODE),
);

export function isStudioMusicPricingMode(
  value: unknown,
): value is StudioMusicPricingMode {
  return (
    typeof value === "string" && STUDIO_MUSIC_PRICING_MODES.has(value)
  );
}

export function isListenerPublicationFree(
  practice: Pick<StudioMusicPublicationInput, "is_free" | "price">,
): boolean {
  return (
    practice.is_free === true ||
    practice.price == null ||
    practice.price <= 0
  );
}

/**
 * Backfill / leftover-null semantics: existing Studio-eligible rows
 * keep pre-PR3.1 behaviour until the author explicitly changes mode.
 */
export function inferLegacyStudioMusicPricingMode(
  practice: Pick<StudioMusicPublicationInput, "is_free" | "price">,
): StudioMusicPricingMode {
  return isListenerPublicationFree(practice)
    ? STUDIO_MUSIC_PRICING_MODE.FREE
    : STUDIO_MUSIC_PRICING_MODE.AUTO_2X_LISTENER;
}

export function normalizeStudioMusicPricingMode(
  value: unknown,
): StudioMusicPricingMode | null {
  return isStudioMusicPricingMode(value) ? value : null;
}

export function resolveStoredStudioMusicPricingMode(
  practice: StudioMusicPricedPublication,
): StudioMusicPricingMode | null {
  const stored = normalizeStudioMusicPricingMode(
    practice.studio_music_pricing_mode,
  );
  if (stored) {
    return stored;
  }
  if (
    practice.music_usage_permission === "platform_reuse_allowed"
  ) {
    return inferLegacyStudioMusicPricingMode(practice);
  }
  return null;
}

export function resolveStudioMusicAcquisition(input: {
  practice: StudioMusicPricedPublication;
  listenerEffectiveMinor?: number | null;
  commerciallyAccessible?: boolean;
}): StudioMusicAcquisition {
  const listenerEffectiveMinor =
    input.listenerEffectiveMinor == null ||
    !Number.isFinite(input.listenerEffectiveMinor)
      ? null
      : input.listenerEffectiveMinor;
  const listenerIsFree =
    isListenerPublicationFree(input.practice) ||
    listenerEffectiveMinor == null ||
    listenerEffectiveMinor <= 0;

  const unavailable = (
    mode: StudioMusicPricingMode | null,
  ): StudioMusicAcquisition => ({
    status: STUDIO_MUSIC_ACQUISITION_STATUS.UNAVAILABLE,
    pricing_mode: mode,
    studio_is_free: false,
    amount_minor: null,
    listener_is_free: listenerIsFree,
    listener_effective_minor: listenerIsFree ? null : listenerEffectiveMinor,
  });

  if (!canAcquireStudioMusic(input.practice, input)) {
    return unavailable(normalizeStudioMusicPricingMode(input.practice.studio_music_pricing_mode));
  }

  const mode = resolveStoredStudioMusicPricingMode(input.practice);
  if (!mode) {
    return unavailable(null);
  }

  if (mode === STUDIO_MUSIC_PRICING_MODE.FREE) {
    return {
      status: STUDIO_MUSIC_ACQUISITION_STATUS.FREE,
      pricing_mode: mode,
      studio_is_free: true,
      amount_minor: null,
      listener_is_free: listenerIsFree,
      listener_effective_minor: listenerIsFree ? null : listenerEffectiveMinor,
    };
  }

  if (mode === STUDIO_MUSIC_PRICING_MODE.FIXED) {
    const fixedMinor = input.practice.studio_music_price_minor;
    if (
      fixedMinor == null ||
      !Number.isFinite(fixedMinor) ||
      !Number.isInteger(fixedMinor) ||
      fixedMinor <= 0
    ) {
      return unavailable(mode);
    }
    return {
      status: STUDIO_MUSIC_ACQUISITION_STATUS.PAID,
      pricing_mode: mode,
      studio_is_free: false,
      amount_minor: fixedMinor,
      listener_is_free: listenerIsFree,
      listener_effective_minor: listenerIsFree ? null : listenerEffectiveMinor,
    };
  }

  const autoMinor = studioLicenseAmountMinor(listenerEffectiveMinor);
  if (autoMinor == null) {
    return unavailable(mode);
  }
  return {
    status: STUDIO_MUSIC_ACQUISITION_STATUS.PAID,
    pricing_mode: mode,
    studio_is_free: false,
    amount_minor: autoMinor,
    listener_is_free: listenerIsFree,
    listener_effective_minor: listenerEffectiveMinor,
  };
}

export function canAcquireFreeStudioMusicLicense(
  practice: StudioMusicPricedPublication,
  options?: { commerciallyAccessible?: boolean },
): boolean {
  return (
    resolveStudioMusicAcquisition({
      practice,
      commerciallyAccessible: options?.commerciallyAccessible,
      listenerEffectiveMinor: null,
    }).status === STUDIO_MUSIC_ACQUISITION_STATUS.FREE
  );
}

export function canAcquirePaidStudioMusicLicense(
  practice: StudioMusicPricedPublication,
  listenerEffectiveMinor?: number | null,
  options?: { commerciallyAccessible?: boolean },
): boolean {
  return (
    resolveStudioMusicAcquisition({
      practice,
      listenerEffectiveMinor,
      commerciallyAccessible: options?.commerciallyAccessible,
    }).status === STUDIO_MUSIC_ACQUISITION_STATUS.PAID
  );
}

export function isStudioMusicFreeForCatalog(
  practice: StudioMusicPricedPublication,
  options?: { commerciallyAccessible?: boolean },
): boolean {
  return canAcquireFreeStudioMusicLicense(practice, options);
}

export function normalizeStudioMusicPricingForSave(input: {
  productKind: string | null | undefined;
  musicUsagePermission: string | null | undefined;
  listenerIsFree: boolean;
  mode: unknown;
  priceRubles?: unknown;
  priceMinor?: unknown;
}):
  | { ok: true; mode: StudioMusicPricingMode | null; priceMinor: number | null }
  | { ok: false; code: string } {
  const isMusic = input.productKind === "music";
  const reuseAllowed =
    input.musicUsagePermission === "platform_reuse_allowed";

  if (!isMusic || !reuseAllowed) {
    return { ok: true, mode: null, priceMinor: null };
  }

  const mode = normalizeStudioMusicPricingMode(input.mode);
  if (!mode) {
    return { ok: false, code: STUDIO_MUSIC_PRICING_ERROR.MODE_REQUIRED };
  }

  if (
    mode === STUDIO_MUSIC_PRICING_MODE.AUTO_2X_LISTENER &&
    input.listenerIsFree
  ) {
    return {
      ok: false,
      code: STUDIO_MUSIC_PRICING_ERROR.AUTO_NOT_ALLOWED_FOR_FREE_LISTENER,
    };
  }

  if (mode === STUDIO_MUSIC_PRICING_MODE.FIXED) {
    let rubles: number | null = null;
    if (
      typeof input.priceRubles === "number" &&
      Number.isInteger(input.priceRubles)
    ) {
      rubles = input.priceRubles;
    } else if (
      typeof input.priceMinor === "number" &&
      Number.isInteger(input.priceMinor) &&
      input.priceMinor > 0 &&
      input.priceMinor % 100 === 0
    ) {
      rubles = input.priceMinor / 100;
    }

    if (rubles == null || !validatePaidPriceRubles(rubles).ok) {
      return { ok: false, code: STUDIO_MUSIC_PRICING_ERROR.INVALID_PRICE };
    }

    return {
      ok: true,
      mode,
      priceMinor: rublesToMinor(rubles),
    };
  }

  return { ok: true, mode, priceMinor: null };
}

export function defaultStudioMusicPricingModeForForm(input: {
  reuseAllowed: boolean;
  listenerIsFree: boolean;
}): StudioMusicPricingMode | null {
  if (!input.reuseAllowed) {
    return null;
  }
  return input.listenerIsFree
    ? STUDIO_MUSIC_PRICING_MODE.FREE
    : STUDIO_MUSIC_PRICING_MODE.AUTO_2X_LISTENER;
}

export function studioMusicPricingModeAfterListenerFlip(input: {
  reuseAllowed: boolean;
  listenerIsFree: boolean;
  currentMode: StudioMusicPricingMode | null;
}): StudioMusicPricingMode | null {
  if (!input.reuseAllowed) {
    return null;
  }
  if (
    input.listenerIsFree &&
    input.currentMode === STUDIO_MUSIC_PRICING_MODE.AUTO_2X_LISTENER
  ) {
    return null;
  }
  if (!input.currentMode) {
    return defaultStudioMusicPricingModeForForm(input);
  }
  return input.currentMode;
}

export function studioMusicPriceMinorToRubles(
  minor: number | null | undefined,
): number {
  if (
    minor == null ||
    !Number.isInteger(minor) ||
    minor <= 0 ||
    minor % 100 !== 0
  ) {
    return MIN_PAID_PRICE_RUB;
  }
  return minor / 100;
}

export function formatListenerCatalogPriceLabel(input: {
  listenerIsFree: boolean;
  listenerEffectiveMinor: number | null | undefined;
}): string {
  if (input.listenerIsFree) {
    return "Прослушивание: бесплатно";
  }
  const rubles =
    input.listenerEffectiveMinor != null &&
    Number.isFinite(input.listenerEffectiveMinor) &&
    input.listenerEffectiveMinor > 0
      ? Math.trunc(input.listenerEffectiveMinor / 100)
      : 0;
  if (rubles <= 0) {
    return "Прослушивание: платно";
  }
  return `Прослушивание: ${formatRubles(rubles)}`;
}

export function formatStudioUseCatalogPriceLabel(input: {
  studioIsFree: boolean;
  studioEffectiveMinor: number | null | undefined;
}): string {
  if (input.studioIsFree) {
    return "Для Студии: бесплатно";
  }
  const rubles =
    input.studioEffectiveMinor != null &&
    Number.isFinite(input.studioEffectiveMinor) &&
    input.studioEffectiveMinor > 0
      ? Math.trunc(input.studioEffectiveMinor / 100)
      : 0;
  if (rubles <= 0) {
    return "Для Студии";
  }
  return `Для Студии: ${formatRubles(rubles)}`;
}
