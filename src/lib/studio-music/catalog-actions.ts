import type { CheckoutOrderStatus } from "@/lib/payments/checkout-status-api";
import { formatRubles } from "@/lib/products/price-format";

import {
  STUDIO_MUSIC_GRANT_SOURCE,
  type StudioMusicGrantSource,
} from "./access";
import {
  resolveStudioMusicDisplayLabel,
  STUDIO_MUSIC_DISPLAY_LABEL,
  type StudioMusicCatalogItem,
} from "./catalog";

export const STUDIO_MUSIC_FREE_ACQUIRE_LABEL = "Получить бесплатно";
export const STUDIO_MUSIC_BUY_LABEL = "Купить для Студии";
export const STUDIO_MUSIC_LOADING_LABEL = "Загрузка…";

export type StudioMusicCatalogActionKind =
  | "none"
  | "available"
  | "own"
  | "free"
  | "paid";

export type StudioMusicCatalogAction = {
  kind: StudioMusicCatalogActionKind;
  label: string;
};

export function formatStudioMusicBuyLabel(
  studioEffectiveMinor: number | null | undefined,
): string {
  if (
    studioEffectiveMinor == null ||
    !Number.isFinite(studioEffectiveMinor) ||
    studioEffectiveMinor <= 0
  ) {
    return STUDIO_MUSIC_BUY_LABEL;
  }

  const rubles = Math.trunc(studioEffectiveMinor / 100);
  if (rubles <= 0) {
    return STUDIO_MUSIC_BUY_LABEL;
  }

  return `Купить для Студии за ${formatRubles(rubles)}`;
}

export function resolveStudioMusicCatalogAction(
  item: Pick<
    StudioMusicCatalogItem,
    | "is_free"
    | "studio_is_free"
    | "studio_effective_minor"
    | "ownership"
  >,
): StudioMusicCatalogAction {
  if (item.ownership.can_use) {
    if (item.ownership.is_author_member && !item.ownership.is_owned) {
      return {
        kind: "own",
        label: STUDIO_MUSIC_DISPLAY_LABEL.OWN,
      };
    }

    return {
      kind: "available",
      label: STUDIO_MUSIC_DISPLAY_LABEL.AVAILABLE,
    };
  }

  if (!item.ownership.can_acquire) {
    return { kind: "none", label: "" };
  }

  const studioIsFree = item.studio_is_free ?? item.is_free;
  if (studioIsFree) {
    return {
      kind: "free",
      label: STUDIO_MUSIC_FREE_ACQUIRE_LABEL,
    };
  }

  return {
    kind: "paid",
    label: formatStudioMusicBuyLabel(item.studio_effective_minor),
  };
}

export function markStudioMusicCatalogItemAvailable(
  item: StudioMusicCatalogItem,
  input?: {
    grantSource?: StudioMusicGrantSource;
    isAuthorMember?: boolean;
  },
): StudioMusicCatalogItem {
  const isAuthorMember =
    input?.isAuthorMember ?? item.ownership.is_author_member;
  const grantSource =
    input?.grantSource ??
    item.ownership.grant_source ??
    STUDIO_MUSIC_GRANT_SOURCE.PURCHASE;
  const ownership = {
    can_acquire: false,
    can_use: true,
    is_owned: grantSource !== STUDIO_MUSIC_GRANT_SOURCE.OWNER,
    is_author_member: isAuthorMember,
    grant_source: grantSource,
  };

  return {
    ...item,
    ownership,
    display_label: resolveStudioMusicDisplayLabel({
      ownership,
      isFree: item.studio_is_free ?? item.is_free,
      studioEffectiveMinor: item.studio_effective_minor,
    }),
  };
}

/**
 * Redirect back from Tochka is never payment proof.
 * Available only after checkout status=paid or a fresh catalog entitlement.
 */
export function resolveStudioMusicEntitlementAfterCheckout(input: {
  redirectedBack: boolean;
  checkoutStatus: CheckoutOrderStatus | null;
  catalogCanUse: boolean;
}): boolean {
  if (input.catalogCanUse) {
    return true;
  }

  return input.checkoutStatus === "paid";
}

export type StudioMusicAlbumExpandClickSource =
  | "row"
  | "tracks"
  | "preview"
  | "acquire";

export function nextStudioMusicAlbumExpanded(input: {
  kind: "album" | "single";
  expanded: boolean;
  source: StudioMusicAlbumExpandClickSource;
}): boolean {
  if (input.kind !== "album") {
    return false;
  }
  if (input.source === "preview" || input.source === "acquire") {
    return input.expanded;
  }
  return !input.expanded;
}

export function studioCheckoutUsesServerOrderAmount(
  orderAmountMinor: number,
  clientExpectedMinor: number | null | undefined,
): number {
  void clientExpectedMinor;
  return orderAmountMinor;
}
