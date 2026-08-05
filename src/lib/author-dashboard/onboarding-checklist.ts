import { hasPublishedFreeProductForCommercialGate } from "@/lib/author-commercial-applications/free-product-gate";
import { hasUserAuthorAvatar } from "@/lib/authors/has-user-avatar";
import type { PublishReadinessResult } from "@/lib/author-products/publish";
import { buildAuthorPublicPath, buildPracticePublicPath } from "@/lib/products/paths";

import type { CommercialOnboardingSectionState } from "./commercial-onboarding";

export const AUTHOR_ONBOARDING_STEP_COUNT = 5;

export const AUTHOR_ONBOARDING_STORAGE_PREFIX =
  "audiolad:author-onboarding:v1:";

export type AuthorOnboardingStepId =
  | "profile"
  | "free_product"
  | "prepare_product"
  | "publish_product"
  | "promotion";

/** First four free steps required before the commercial route unlocks. */
export const AUTHOR_ONBOARDING_COMMERCIAL_GATE_STEP_IDS: readonly AuthorOnboardingStepId[] =
  ["profile", "free_product", "prepare_product", "publish_product"];

export type AuthorOnboardingProfileInput = {
  short_positioning?: string | null;
  full_bio?: string | null;
  avatar_url?: string | null;
  avatar_path?: string | null;
  avatar_image?: unknown;
};

export type AuthorOnboardingProductInput = {
  id: string;
  title: string;
  slug: string;
  status: string;
  is_free: boolean;
  price: number;
  product_kind?: string | null;
  updated_at: string;
  readiness: PublishReadinessResult;
};

export type AuthorOnboardingCampaignInput = {
  id: string;
  status: string;
  practice_id: string;
  practice_status: string;
};

export type AuthorOnboardingStepState = {
  id: AuthorOnboardingStepId;
  title: string;
  description: string;
  completed: boolean;
  active: boolean;
  ctaLabel: string;
  ctaHref: string;
  ctaExternal?: boolean;
  hint?: string | null;
  readiness?: {
    completedCount: number;
    totalCount: number;
    requirements: Array<{
      key: string;
      label: string;
      ok: boolean;
    }>;
  } | null;
};

export type AuthorOnboardingFreeChecklistState = {
  authorId: string;
  authorSlug: string;
  /** Free-tier completed steps (of 5). */
  completedCount: number;
  totalCount: number;
  /** True when all five free-tier steps are done. */
  complete: boolean;
  /**
   * True when the first four free steps are done.
   * Step 5 (promotion) does not block the commercial route.
   */
  readyForCommercial: boolean;
  focusProductId: string | null;
  steps: AuthorOnboardingStepState[];
  hasNonArchivedPaidOnlyProducts: boolean;
  publishedProductId: string | null;
  publishedProductSlug: string | null;
};

export type AuthorOnboardingChecklistState = AuthorOnboardingFreeChecklistState & {
  commercial: CommercialOnboardingSectionState;
  /** Free + commercial sections fully complete. */
  journeyComplete: boolean;
};

export type AuthorOnboardingUiPreference = {
  collapsed: boolean;
  dismissed: boolean;
};

const STEP_META: Record<
  AuthorOnboardingStepId,
  { title: string; description: string }
> = {
  profile: {
    title: "Оформите страницу автора",
    description:
      "Добавьте фотографию, описание и информацию о себе, чтобы слушатели понимали, кто вы и чем можете им помочь.",
  },
  free_product: {
    title: "Создайте первый бесплатный продукт",
    description:
      "Бесплатная практика поможет слушателям познакомиться с вами и вашим подходом.",
  },
  prepare_product: {
    title: "Подготовьте продукт к публикации",
    description:
      "Добавьте обложку, описание и аудиозапись. Перед публикацией проверьте, как продукт будет выглядеть для слушателей.",
  },
  publish_product: {
    title: "Опубликуйте первый продукт",
    description:
      "После публикации продукт появится на вашей странице и станет доступен слушателям.",
  },
  promotion: {
    title: "Поделитесь продуктом со слушателями",
    description:
      "Создайте ссылку для продвижения и отправьте её аудитории. Статистика переходов и прослушиваний появится в кабинете.",
  },
};

/** User-facing readiness chips for step 3 (subset of shared publish rules). */
export const ONBOARDING_VISIBLE_READINESS_KEYS = [
  "description",
  "cover",
  "audio",
  "topics",
] as const;

export function buildAuthorOnboardingStorageKey(authorId: string): string {
  return `${AUTHOR_ONBOARDING_STORAGE_PREFIX}${authorId}`;
}

export function parseAuthorOnboardingUiPreference(
  raw: string | null,
): AuthorOnboardingUiPreference {
  if (!raw) {
    return { collapsed: false, dismissed: false };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthorOnboardingUiPreference>;

    return {
      collapsed: parsed.collapsed === true,
      dismissed: parsed.dismissed === true,
    };
  } catch {
    return { collapsed: false, dismissed: false };
  }
}

export function serializeAuthorOnboardingUiPreference(
  preference: AuthorOnboardingUiPreference,
): string {
  return JSON.stringify({
    collapsed: preference.collapsed === true,
    dismissed: preference.dismissed === true,
  });
}

export function isAuthorProfileMinimumComplete(
  profile: AuthorOnboardingProfileInput,
): boolean {
  const shortPositioning =
    typeof profile.short_positioning === "string"
      ? profile.short_positioning.trim()
      : "";
  const fullBio =
    typeof profile.full_bio === "string" ? profile.full_bio.trim() : "";

  return (
    hasUserAuthorAvatar(profile) &&
    shortPositioning.length > 0 &&
    fullBio.length > 0
  );
}

export function isNonArchivedProduct(
  product: Pick<AuthorOnboardingProductInput, "status">,
): boolean {
  return product.status !== "archived";
}

export function isFreeNonArchivedProduct(
  product: Pick<AuthorOnboardingProductInput, "status" | "is_free">,
): boolean {
  return isNonArchivedProduct(product) && product.is_free === true;
}

export function isPublishedProduct(
  product: Pick<AuthorOnboardingProductInput, "status">,
): boolean {
  return product.status === "published";
}

export function isActivePromotionForPublishedProduct(
  campaign: AuthorOnboardingCampaignInput,
): boolean {
  return (
    campaign.status === "active" && campaign.practice_status === "published"
  );
}

function readinessScore(readiness: PublishReadinessResult): number {
  if (readiness.totalCount <= 0) {
    return 0;
  }

  return readiness.completedCount / readiness.totalCount;
}

/**
 * Higher is better for onboarding focus among equal readiness scores.
 * Prefer actionable unpublished work over already-published products.
 */
export function focusProductSuitabilityScore(
  product: Pick<AuthorOnboardingProductInput, "status" | "readiness">,
): number {
  if (product.status === "archived") {
    return -1;
  }

  if (product.status === "published") {
    return 1;
  }

  if (product.readiness.ok) {
    return 3;
  }

  if (product.readiness.completedCount > 0) {
    return 2;
  }

  return 0;
}

/**
 * @deprecated Prefer hasPublishedFreeProductForCommercialGate(products).
 * Kept for older unit imports; mirrors the historical 4-flag free-step gate.
 */
export function isFreeOnboardingReadyForCommercial(
  completionFlags: readonly boolean[],
): boolean {
  // Flags are ordered as AuthorOnboardingStepId list; gate uses the first four.
  return (
    completionFlags.length >= AUTHOR_ONBOARDING_COMMERCIAL_GATE_STEP_IDS.length &&
    AUTHOR_ONBOARDING_COMMERCIAL_GATE_STEP_IDS.every(
      (_stepId, index) => completionFlags[index] === true,
    )
  );
}

export function selectFocusProduct(
  products: AuthorOnboardingProductInput[],
): AuthorOnboardingProductInput | null {
  const nonArchived = products.filter(isNonArchivedProduct);

  if (nonArchived.length === 0) {
    return null;
  }

  const workCandidates = nonArchived.filter(
    (product) => product.status !== "published",
  );
  const pool = workCandidates.length > 0 ? workCandidates : nonArchived;

  const sorted = [...pool].sort((left, right) => {
    const readinessDiff =
      readinessScore(right.readiness) - readinessScore(left.readiness);

    if (readinessDiff !== 0) {
      return readinessDiff;
    }

    const suitabilityDiff =
      focusProductSuitabilityScore(right) - focusProductSuitabilityScore(left);

    if (suitabilityDiff !== 0) {
      return suitabilityDiff;
    }

    const leftUpdated = Date.parse(left.updated_at) || 0;
    const rightUpdated = Date.parse(right.updated_at) || 0;

    return rightUpdated - leftUpdated;
  });

  return sorted[0] ?? null;
}

function buildVisibleReadiness(
  readiness: PublishReadinessResult | null | undefined,
) {
  if (!readiness) {
    return null;
  }

  const requirements = readiness.requirements
    .filter((item) =>
      (ONBOARDING_VISIBLE_READINESS_KEYS as readonly string[]).includes(
        item.key,
      ),
    )
    .map((item) => ({
      key: item.key,
      label: item.label,
      ok: item.ok,
    }));

  return {
    completedCount: requirements.filter((item) => item.ok).length,
    totalCount: requirements.length,
    requirements,
  };
}

export function evaluateAuthorOnboardingChecklist(input: {
  authorId: string;
  authorSlug: string;
  profile: AuthorOnboardingProfileInput;
  products: AuthorOnboardingProductInput[];
  campaigns: AuthorOnboardingCampaignInput[];
}): AuthorOnboardingFreeChecklistState {
  const { authorId, authorSlug, profile, products, campaigns } = input;

  const nonArchived = products.filter(isNonArchivedProduct);
  const freeProducts = nonArchived.filter((product) => product.is_free);
  const paidOnlyNonArchived =
    nonArchived.length > 0 && freeProducts.length === 0;
  const publishedFreeProducts = nonArchived.filter((product) =>
    hasPublishedFreeProductForCommercialGate([product]),
  );
  const focusProduct = selectFocusProduct(products);
  const publishedProduct = publishedFreeProducts[0] ?? null;

  const profileComplete = isAuthorProfileMinimumComplete(profile);
  const freeProductComplete = freeProducts.length > 0;
  const prepareComplete = nonArchived.some(
    (product) =>
      hasPublishedFreeProductForCommercialGate([product]) || product.readiness.ok,
  );
  // Publish step and commercial unlock share the same published-free predicate.
  const publishComplete = publishedFreeProducts.length > 0;
  const promotionComplete = campaigns.some(isActivePromotionForPublishedProduct);

  const completionFlags = [
    profileComplete,
    freeProductComplete,
    prepareComplete,
    publishComplete,
    promotionComplete,
  ];
  const completedCount = completionFlags.filter(Boolean).length;
  const firstIncompleteIndex = completionFlags.findIndex((flag) => !flag);
  const readyForCommercial =
    hasPublishedFreeProductForCommercialGate(nonArchived);

  const newProductHref = `/author-dashboard/products/new?author=${encodeURIComponent(authorSlug)}`;
  const profileHref = `/author-dashboard/profile?author=${encodeURIComponent(authorSlug)}`;
  const promotionHref = `/author-dashboard/promotion?author=${encodeURIComponent(authorSlug)}`;
  const focusEditHref = focusProduct
    ? `/author-dashboard/products/${focusProduct.id}`
    : newProductHref;
  const publishedPublicHref =
    publishedProduct && publishedProduct.slug
      ? buildPracticePublicPath(authorSlug, publishedProduct.slug)
      : buildAuthorPublicPath(authorSlug);

  const steps: AuthorOnboardingStepState[] = [
    {
      id: "profile",
      ...STEP_META.profile,
      completed: profileComplete,
      active: firstIncompleteIndex === 0,
      ctaLabel: profileComplete
        ? "Открыть страницу автора"
        : profile.short_positioning?.trim() ||
            profile.full_bio?.trim() ||
            hasUserAuthorAvatar(profile)
          ? "Продолжить оформление"
          : "Оформить страницу",
      ctaHref: profileComplete
        ? buildAuthorPublicPath(authorSlug)
        : profileHref,
      ctaExternal: profileComplete,
    },
    {
      id: "free_product",
      ...STEP_META.free_product,
      completed: freeProductComplete,
      active: firstIncompleteIndex === 1,
      ctaLabel: freeProductComplete
        ? "Продолжить работу"
        : "Создать бесплатный продукт",
      ctaHref: freeProductComplete
        ? `/author-dashboard/products/${freeProducts[0].id}`
        : newProductHref,
      hint: paidOnlyNonArchived
        ? "Для старта на АудиоЛаде создайте бесплатный продукт — так слушатели смогут познакомиться с вами без покупки."
        : null,
    },
    {
      id: "prepare_product",
      ...STEP_META.prepare_product,
      completed: prepareComplete,
      active: firstIncompleteIndex === 2,
      ctaLabel: "Завершить оформление",
      ctaHref: focusEditHref,
      readiness: buildVisibleReadiness(
        focusProduct?.readiness ??
          (publishedProduct
            ? publishedProduct.readiness
            : null),
      ),
    },
    {
      id: "publish_product",
      ...STEP_META.publish_product,
      completed: publishComplete,
      active: firstIncompleteIndex === 3,
      ctaLabel: publishComplete
        ? "Открыть страницу продукта"
        : "Перейти к публикации",
      ctaHref: publishComplete ? publishedPublicHref : focusEditHref,
      ctaExternal: publishComplete,
    },
    {
      id: "promotion",
      ...STEP_META.promotion,
      completed: promotionComplete,
      active: firstIncompleteIndex === 4,
      ctaLabel: "Создать ссылку",
      ctaHref: promotionHref,
    },
  ];

  return {
    authorId,
    authorSlug,
    completedCount,
    totalCount: AUTHOR_ONBOARDING_STEP_COUNT,
    complete: completedCount === AUTHOR_ONBOARDING_STEP_COUNT,
    readyForCommercial,
    focusProductId: focusProduct?.id ?? null,
    steps,
    hasNonArchivedPaidOnlyProducts: paidOnlyNonArchived,
    publishedProductId: publishedProduct?.id ?? null,
    publishedProductSlug: publishedProduct?.slug ?? null,
  };
}
