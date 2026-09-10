import {
  MUSIC_USAGE_PERMISSION,
  PRODUCT_KIND,
} from "@/lib/author-products/product-kind";

export const STUDIO_MUSIC_ORDER_KIND = "studio_music_license" as const;

export const STUDIO_MUSIC_GRANT_SOURCE = {
  PURCHASE: "purchase",
  FREE: "free",
  OWNER: "owner",
} as const;

export type StudioMusicGrantSource =
  (typeof STUDIO_MUSIC_GRANT_SOURCE)[keyof typeof STUDIO_MUSIC_GRANT_SOURCE];

export const STUDIO_PRICE_MULTIPLIER = 2;

export type StudioMusicPublicationInput = {
  id?: string | null;
  status?: string | null;
  deleted_at?: string | null;
  product_kind?: string | null;
  publication_class?: string | null;
  music_usage_permission?: string | null;
  is_free?: boolean | null;
  price?: number | null;
  studio_music_pricing_mode?: string | null;
  studio_music_price_minor?: number | null;
};

export type StudioMusicEntitlementInput = {
  revoked_at?: string | null;
};

/**
 * Music publication for Studio reuse: product_kind=music or
 * publication_class=release. Does not invent a second catalog.
 */
export function isStudioMusicPublication(
  practice: Pick<
    StudioMusicPublicationInput,
    "product_kind" | "publication_class"
  >,
): boolean {
  return (
    practice.product_kind === PRODUCT_KIND.MUSIC ||
    practice.publication_class === "release"
  );
}

export function studioLicenseAmountMinor(
  listenerEffectiveMinor: number | null | undefined,
): number | null {
  if (
    listenerEffectiveMinor == null ||
    !Number.isFinite(listenerEffectiveMinor) ||
    listenerEffectiveMinor <= 0
  ) {
    return null;
  }

  return listenerEffectiveMinor * STUDIO_PRICE_MULTIPLIER;
}

export function hasStudioMusicEntitlement(
  entitlement: StudioMusicEntitlementInput | null | undefined,
): boolean {
  return Boolean(entitlement) && entitlement?.revoked_at == null;
}

/**
 * New grant only. Permission / published / commercial visibility gate
 * acquisition. Existing entitlements stay valid when these later change.
 */
export function canAcquireStudioMusic(
  practice: StudioMusicPublicationInput,
  options?: { commerciallyAccessible?: boolean },
): boolean {
  if (!practice.id || practice.deleted_at) {
    return false;
  }

  if (practice.status !== "published") {
    return false;
  }

  if (!isStudioMusicPublication(practice)) {
    return false;
  }

  if (
    practice.music_usage_permission !==
    MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED
  ) {
    return false;
  }

  if (options?.commerciallyAccessible === false) {
    return false;
  }

  return true;
}

function isListenerPublicationFree(
  practice: Pick<StudioMusicPublicationInput, "is_free" | "price">,
): boolean {
  return (
    practice.is_free === true ||
    practice.price == null ||
    practice.price <= 0
  );
}

function storedOrLegacyStudioPricingMode(
  practice: StudioMusicPublicationInput,
): "free" | "auto_2x_listener" | "fixed" | null {
  if (
    practice.studio_music_pricing_mode === "free" ||
    practice.studio_music_pricing_mode === "auto_2x_listener" ||
    practice.studio_music_pricing_mode === "fixed"
  ) {
    return practice.studio_music_pricing_mode;
  }

  if (
    practice.music_usage_permission !==
    MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED
  ) {
    return null;
  }

  return isListenerPublicationFree(practice) ? "free" : "auto_2x_listener";
}

export function canAcquirePaidStudioMusic(
  practice: StudioMusicPublicationInput,
  options?: {
    commerciallyAccessible?: boolean;
    listenerEffectiveMinor?: number | null;
  },
): boolean {
  if (!canAcquireStudioMusic(practice, options)) {
    return false;
  }

  const mode = storedOrLegacyStudioPricingMode(practice);
  if (mode === "fixed") {
    return (
      practice.studio_music_price_minor != null &&
      Number.isFinite(practice.studio_music_price_minor) &&
      practice.studio_music_price_minor > 0
    );
  }

  if (mode !== "auto_2x_listener") {
    return false;
  }

  if (
    options?.listenerEffectiveMinor != null &&
    options.listenerEffectiveMinor <= 0
  ) {
    return false;
  }

  return true;
}

export function canAcquireFreeStudioMusic(
  practice: StudioMusicPublicationInput,
  options?: { commerciallyAccessible?: boolean },
): boolean {
  if (!canAcquireStudioMusic(practice, options)) {
    return false;
  }

  return storedOrLegacyStudioPricingMode(practice) === "free";
}

/**
 * Use path: active stored entitlement OR live author membership.
 * Must not require current platform_reuse_allowed.
 * Must not unlock ordinary listen / user_practices.
 */
export function canUseMusicInStudio(input: {
  entitlement?: StudioMusicEntitlementInput | null;
  isAuthorMember?: boolean;
}): boolean {
  return (
    hasStudioMusicEntitlement(input.entitlement) || input.isAuthorMember === true
  );
}
