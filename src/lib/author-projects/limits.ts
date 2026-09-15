import {
  DEFAULT_AUTHOR_PROJECT_LIMIT,
  PREMIUM_AUTHOR_PROJECT_LIMIT,
} from "@/lib/author-projects/constants";

export type AuthorProjectLimitSource =
  | "override"
  | "premium"
  | "default"
  | "purchased";

export type AuthorProjectLimitResolution = {
  limit: number | null;
  unlimited: boolean;
  source: AuthorProjectLimitSource;
  premiumEnabled: boolean;
  hasOverride: boolean;
  baseLimit: number;
  purchasedSlots: number;
};

/**
 * base = admin_override ?? premium_plan_limit ?? 1
 * effective = unlimited ? null : base + purchased_slots
 */
export function resolveEffectiveAuthorProjectLimit(input: {
  override: number | null | undefined;
  unlimited: boolean | null | undefined;
  premiumEnabled: boolean | null | undefined;
  purchasedSlots?: number | null | undefined;
}): AuthorProjectLimitResolution {
  const override =
    typeof input.override === "number" &&
    Number.isFinite(input.override) &&
    input.override >= 1
      ? Math.floor(input.override)
      : null;
  const premiumEnabled = input.premiumEnabled === true;
  const purchasedSlots =
    typeof input.purchasedSlots === "number" &&
    Number.isFinite(input.purchasedSlots) &&
    input.purchasedSlots > 0
      ? Math.floor(input.purchasedSlots)
      : 0;

  if (input.unlimited === true) {
    return {
      limit: null,
      unlimited: true,
      source: "override",
      premiumEnabled,
      hasOverride: true,
      baseLimit: override ?? (premiumEnabled ? PREMIUM_AUTHOR_PROJECT_LIMIT : DEFAULT_AUTHOR_PROJECT_LIMIT),
      purchasedSlots,
    };
  }

  let baseLimit: number;
  let source: AuthorProjectLimitSource;

  if (override != null) {
    baseLimit = override;
    source = "override";
  } else if (premiumEnabled) {
    baseLimit = PREMIUM_AUTHOR_PROJECT_LIMIT;
    source = "premium";
  } else {
    baseLimit = DEFAULT_AUTHOR_PROJECT_LIMIT;
    source = "default";
  }

  const limit = baseLimit + purchasedSlots;
  if (purchasedSlots > 0) {
    source = "purchased";
  }

  return {
    limit,
    unlimited: false,
    source,
    premiumEnabled,
    hasOverride: override != null,
    baseLimit,
    purchasedSlots,
  };
}

export function canCreateOwnedAuthorProject(
  used: number,
  limit: number | null,
  unlimited = false,
): boolean {
  return unlimited || (limit !== null && used < limit && limit >= 1);
}

/**
 * Capacity purchase offer when the author cannot create another owned project
 * and is not on an unlimited entitlement.
 */
export function shouldShowCapacityPurchaseOffer(input: {
  used: number;
  limit: number | null;
  unlimited: boolean;
}): boolean {
  if (input.unlimited) {
    return false;
  }
  return !canCreateOwnedAuthorProject(input.used, input.limit, false);
}

/**
 * @deprecated Use shouldShowCapacityPurchaseOffer. Kept for older call sites
 * that still name the Premium stub; behavior now matches capacity offer.
 */
export function shouldShowPremiumProjectUpsell(input: {
  used: number;
  limit: number | null;
  unlimited: boolean;
  source?: AuthorProjectLimitSource;
}): boolean {
  return shouldShowCapacityPurchaseOffer(input);
}

export function getAuthorProjectLimitReachedMessage(input: {
  used: number;
  limit: number | null;
  unlimited: boolean;
  source?: AuthorProjectLimitSource;
}): string {
  if (input.unlimited) {
    return "Лимит проектов не применяется.";
  }

  if (input.limit == null) {
    return "Лимит проектов исчерпан.";
  }

  if (
    input.limit === DEFAULT_AUTHOR_PROJECT_LIMIT &&
    (input.source === "default" || input.source == null)
  ) {
    return [
      "В базовом кабинете доступен один авторский проект.",
      "Можно один раз добавить проекты — без подписки и без срока действия.",
    ].join("\n");
  }

  return `Лимит проектов исчерпан: ${input.used} из ${input.limit}.`;
}
