import type { AuthorCommercialApplicationStatus } from "@/lib/author-commercial-applications/types";
import { mapPayoutProfileStatusToOnboardingVisual } from "@/lib/author-payout-profiles/status";
import type { AuthorPayoutProfileStatus } from "@/lib/author-payout-profiles/types";
import {
  isActivePromotionForPublishedProduct,
  isNonArchivedProduct,
  isPublishedProduct,
  selectFocusProduct,
  type AuthorOnboardingCampaignInput,
  type AuthorOnboardingProductInput,
} from "@/lib/author-dashboard/onboarding-checklist";
import type { PublishReadinessResult } from "@/lib/author-products/publish";
import {
  authorAccessAllowsPaidProducts,
  isAuthorCommercialApprovedAccess,
  type AuthorAccessStatus,
} from "@/lib/authors/access";
import {
  buildPracticePublicPath,
  buildPracticePublishPreviewPath,
} from "@/lib/products/paths";

export const COMMERCIAL_ONBOARDING_STEP_COUNT = 7;

export type CommercialOnboardingStepId =
  | "commercial_application"
  | "payout_details"
  | "terms_acceptance"
  | "paid_product"
  | "prepare_paid_product"
  | "publish_paid_product"
  | "paid_promotion";

export type OnboardingStepVisualState =
  | "completed"
  | "active"
  | "locked"
  | "coming_soon";

/**
 * Platform capability flags for commercial onboarding.
 * Flip to `true` when the corresponding author-facing surface ships —
 * without inventing fake forms or unlocks.
 */
export type CommercialOnboardingCapabilities = {
  /** Author can open a real commercial-status application / status page. */
  applicationSubmissionAvailable: boolean;
  /** Author payout / legal details form exists and persists. */
  payoutDetailsAvailable: boolean;
  /** Author cooperation terms / offer acceptance exists and persists. */
  termsAcceptanceAvailable: boolean;
};

export const DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES: CommercialOnboardingCapabilities =
  {
    applicationSubmissionAvailable: true,
    payoutDetailsAvailable: true,
    termsAcceptanceAvailable: false,
  };

export type CommercialApplicationStatus =
  | "none"
  | AuthorCommercialApplicationStatus;

export type CommercialOnboardingStepState = {
  id: CommercialOnboardingStepId;
  title: string;
  description: string;
  state: OnboardingStepVisualState;
  statusLabel?: string;
  actionLabel?: string;
  href?: string;
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

export type CommercialOnboardingSectionState = {
  unlocked: boolean;
  completedCount: number;
  totalCount: number;
  complete: boolean;
  /** Shown instead of N/7 while the commercial section is gated. */
  progressMode: "gated" | "count";
  steps: CommercialOnboardingStepState[];
  focusPaidProductId: string | null;
  publishedPaidProductId: string | null;
  publishedPaidProductSlug: string | null;
};

const STEP_META: Record<
  CommercialOnboardingStepId,
  { title: string; description: string }
> = {
  commercial_application: {
    title: "Подайте заявку на коммерческий статус",
    description:
      "Расскажите о себе и своих аудиопродуктах. Мы рассмотрим заявку и откроем возможность продавать материалы на АудиоЛаде.",
  },
  payout_details: {
    title: "Заполните данные для выплат",
    description:
      "Укажите сведения, необходимые для начисления и перечисления авторского вознаграждения.",
  },
  terms_acceptance: {
    title: "Примите условия сотрудничества",
    description:
      "Ознакомьтесь с условиями размещения платных продуктов, расчёта вознаграждения и работы с АудиоЛадом.",
  },
  paid_product: {
    title: "Создайте первый платный продукт",
    description:
      "Добавьте аудиоматериалы, описание, обложку и установите стоимость продукта.",
  },
  prepare_paid_product: {
    title: "Подготовьте платный продукт к публикации",
    description:
      "Проверьте страницу продукта, содержание, цену и то, как его увидят слушатели.",
  },
  publish_paid_product: {
    title: "Опубликуйте первый платный продукт",
    description:
      "После публикации продукт появится на вашей странице и станет доступен для покупки.",
  },
  paid_promotion: {
    title: "Создайте ссылку для продвижения",
    description:
      "Поделитесь платным продуктом со своей аудиторией и отслеживайте переходы, прослушивания и продажи.",
  },
};

const LOCKED_STATUS_LABEL = "Пока недоступно";
const COMING_SOON_STATUS_LABEL = "Скоро будет доступно";

export function getCommercialApplicationStatusLabel(
  status: CommercialApplicationStatus,
): string | null {
  switch (status) {
    case "none":
      return null;
    case "draft":
      return "Черновик";
    case "submitted":
      return "Заявка отправлена";
    case "in_review":
      return "На рассмотрении";
    case "needs_changes":
      return "Нужно уточнить данные";
    case "approved":
      return "Одобрена";
    case "rejected":
      return "Заявка не одобрена";
    case "withdrawn":
      return "Отозвана";
    default:
      return null;
  }
}

/**
 * Map workspace access + commercial application row onto checklist status.
 *
 * `authors.access_status` remains authoritative for commercial tier.
 * When `legacyPendingWithoutApplication` is set (pending without a row),
 * treat as in_review and do not prompt to create a new application.
 */
export function resolveCommercialApplicationStatus(input: {
  accessStatus: AuthorAccessStatus | string | null | undefined;
  applicationStatus?: AuthorCommercialApplicationStatus | null;
  legacyPendingWithoutApplication?: boolean;
}): CommercialApplicationStatus {
  if (isAuthorCommercialApprovedAccess(input.accessStatus)) {
    return "approved";
  }

  if (input.legacyPendingWithoutApplication && !input.applicationStatus) {
    return "in_review";
  }

  if (input.accessStatus === "commercial_pending") {
    if (
      input.applicationStatus === "submitted" ||
      input.applicationStatus === "in_review" ||
      input.applicationStatus === "needs_changes"
    ) {
      return input.applicationStatus;
    }

    return "in_review";
  }

  if (input.applicationStatus) {
    return input.applicationStatus;
  }

  return "none";
}

export function isPaidNonArchivedProduct(
  product: Pick<AuthorOnboardingProductInput, "status" | "is_free">,
): boolean {
  return isNonArchivedProduct(product) && product.is_free === false;
}

function buildVisiblePaidReadiness(
  readiness: PublishReadinessResult | null | undefined,
) {
  if (!readiness) {
    return null;
  }

  const keys = ["description", "cover", "audio", "topics", "price"] as const;
  const requirements = readiness.requirements
    .filter((item) => (keys as readonly string[]).includes(item.key))
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

function lockedStep(
  id: CommercialOnboardingStepId,
  overrides?: Partial<CommercialOnboardingStepState>,
): CommercialOnboardingStepState {
  return {
    id,
    ...STEP_META[id],
    state: "locked",
    statusLabel: LOCKED_STATUS_LABEL,
    hint: null,
    readiness: null,
    ...overrides,
  };
}

function comingSoonStep(
  id: CommercialOnboardingStepId,
  overrides?: Partial<CommercialOnboardingStepState>,
): CommercialOnboardingStepState {
  return {
    id,
    ...STEP_META[id],
    state: "coming_soon",
    statusLabel: COMING_SOON_STATUS_LABEL,
    hint: null,
    readiness: null,
    ...overrides,
  };
}

export function evaluateCommercialOnboardingChecklist(input: {
  authorSlug: string;
  accessStatus: AuthorAccessStatus;
  freeGateReady: boolean;
  products: AuthorOnboardingProductInput[];
  campaigns: AuthorOnboardingCampaignInput[];
  capabilities?: CommercialOnboardingCapabilities;
  /** Future: persisted payout/legal details completeness. */
  payoutDetailsComplete?: boolean;
  /** Future: persisted cooperation terms acceptance. */
  termsAccepted?: boolean;
  /** Loaded payout profile status row. */
  payoutProfileStatus?: AuthorPayoutProfileStatus | null;
  /** Review comment from payout profile (needs_changes / rejected). */
  payoutProfileReviewComment?: string | null;
  /**
   * Legacy commercial_active / commercial authors: keep payout step completed
   * for onboarding presentation even without a verified payout_profile row.
   */
  legacyCommercialActive?: boolean;
  /** Dedicated commercial application status row. */
  applicationStatus?: AuthorCommercialApplicationStatus | null;
  /** Review comment shown to the author (needs_changes / rejected). */
  applicationReviewComment?: string | null;
  /**
   * Legacy commercial_pending workspace without a commercial application row.
   * Treat as in_review and do not offer a create-application CTA.
   */
  legacyPendingWithoutApplication?: boolean;
  /** Real application / status page href. */
  applicationHref?: string | null;
  /** Future: payout details form href. */
  payoutDetailsHref?: string | null;
  /** Future: terms acceptance page href. */
  termsHref?: string | null;
}): CommercialOnboardingSectionState {
  const {
    authorSlug,
    accessStatus,
    freeGateReady,
    products,
    campaigns,
    applicationStatus = null,
    applicationReviewComment = null,
    legacyPendingWithoutApplication = false,
    payoutDetailsHref = null,
    termsHref = null,
    payoutProfileStatus = null,
    payoutProfileReviewComment = null,
    legacyCommercialActive = false,
  } = input;

  const capabilities =
    input.capabilities ?? DEFAULT_COMMERCIAL_ONBOARDING_CAPABILITIES;
  const payoutDetailsComplete = input.payoutDetailsComplete === true;
  const termsAccepted = input.termsAccepted === true;
  const resolvedApplicationHref =
    input.applicationHref ??
    `/author-dashboard/commercial-application?author=${encodeURIComponent(authorSlug)}`;

  const paidProducts = products.filter(isPaidNonArchivedProduct);
  const publishedPaidProducts = paidProducts.filter(isPublishedProduct);
  const focusPaidProduct = selectFocusProduct(paidProducts);
  const publishedPaidProduct = publishedPaidProducts[0] ?? null;

  const application = resolveCommercialApplicationStatus({
    accessStatus,
    applicationStatus,
    legacyPendingWithoutApplication,
  });
  const applicationApproved = application === "approved";
  const applicationInFlight =
    application === "submitted" ||
    application === "in_review" ||
    application === "draft" ||
    application === "needs_changes" ||
    application === "rejected";

  const payoutStepComplete =
    capabilities.payoutDetailsAvailable && payoutDetailsComplete;
  const termsStepComplete =
    capabilities.termsAcceptanceAvailable && termsAccepted;

  const paidProductComplete = paidProducts.length > 0;
  const preparePaidComplete = paidProducts.some(
    (product) => product.status === "published" || product.readiness.ok,
  );
  const publishPaidComplete = publishedPaidProducts.length > 0;

  const paidPublishedIds = new Set(
    publishedPaidProducts.map((product) => product.id),
  );
  const paidPromotionComplete = campaigns.some(
    (campaign) =>
      isActivePromotionForPublishedProduct(campaign) &&
      paidPublishedIds.has(campaign.practice_id),
  );

  const newProductHref = `/author-dashboard/products/new?author=${encodeURIComponent(authorSlug)}`;
  const promotionHref = `/author-dashboard/promotion?author=${encodeURIComponent(authorSlug)}`;
  const focusEditHref = focusPaidProduct
    ? `/author-dashboard/products/${focusPaidProduct.id}`
    : newProductHref;
  const focusPreviewHref =
    focusPaidProduct &&
    focusPaidProduct.slug &&
    focusPaidProduct.status !== "published"
      ? buildPracticePublishPreviewPath(authorSlug, focusPaidProduct.slug)
      : focusEditHref;
  const publishedPublicHref =
    publishedPaidProduct && publishedPaidProduct.slug
      ? buildPracticePublicPath(authorSlug, publishedPaidProduct.slug)
      : focusEditHref;

  const canCreatePaidProducts = authorAccessAllowsPaidProducts(accessStatus);

  if (!freeGateReady) {
    const steps: CommercialOnboardingStepState[] = [
      lockedStep("commercial_application", {
        hint: "Коммерческие возможности станут доступны после публикации первого бесплатного продукта.",
      }),
      lockedStep("payout_details"),
      lockedStep("terms_acceptance"),
      lockedStep("paid_product"),
      lockedStep("prepare_paid_product"),
      lockedStep("publish_paid_product"),
      lockedStep("paid_promotion"),
    ];

    return {
      unlocked: false,
      completedCount: 0,
      totalCount: COMMERCIAL_ONBOARDING_STEP_COUNT,
      complete: false,
      progressMode: "gated",
      steps,
      focusPaidProductId: focusPaidProduct?.id ?? null,
      publishedPaidProductId: publishedPaidProduct?.id ?? null,
      publishedPaidProductSlug: publishedPaidProduct?.slug ?? null,
    };
  }

  // --- Step 1: commercial application ---
  let applicationStep: CommercialOnboardingStepState;
  const reviewComment = applicationReviewComment?.trim() || null;

  if (applicationApproved) {
    applicationStep = {
      id: "commercial_application",
      ...STEP_META.commercial_application,
      state: "completed",
      statusLabel: getCommercialApplicationStatusLabel("approved") ?? undefined,
      hint: null,
      readiness: null,
    };
  } else if (applicationInFlight) {
    const canContinue =
      capabilities.applicationSubmissionAvailable &&
      !legacyPendingWithoutApplication &&
      (application === "draft" || application === "needs_changes");
    const canView =
      capabilities.applicationSubmissionAvailable &&
      !legacyPendingWithoutApplication &&
      (application === "submitted" ||
        application === "in_review" ||
        application === "rejected");

    let actionLabel: string | undefined;
    if (canContinue) {
      actionLabel =
        application === "needs_changes"
          ? "Исправить заявку"
          : "Продолжить заполнение";
    } else if (canView) {
      actionLabel = "Смотреть заявку";
    }

    // Yellow hint is only for extra staff context / warnings — not for the
    // same copy already shown as the step description.
    let hint: string | null = null;
    if (reviewComment) {
      hint = reviewComment;
    } else if (application === "rejected") {
      hint =
        "Заявка не одобрена. Повторная подача откроется только после отдельного решения команды.";
    } else if (application === "needs_changes") {
      hint = "Нужно уточнить данные в заявке.";
    } else if (application === "in_review") {
      hint = "Мы рассмотрим заявку и сообщим о решении.";
    } else {
      hint = null;
    }

    const description =
      application === "submitted"
        ? "Мы получили заявку и сообщим о результате после рассмотрения."
        : STEP_META.commercial_application.description;

    applicationStep = {
      id: "commercial_application",
      title: STEP_META.commercial_application.title,
      description,
      state: "active",
      statusLabel:
        getCommercialApplicationStatusLabel(application) ?? undefined,
      actionLabel,
      href:
        canContinue || canView ? resolvedApplicationHref : undefined,
      hint,
      readiness: null,
    };
  } else if (!capabilities.applicationSubmissionAvailable) {
    applicationStep = comingSoonStep("commercial_application");
  } else {
    applicationStep = {
      id: "commercial_application",
      ...STEP_META.commercial_application,
      state: "active",
      actionLabel: "Подать заявку",
      href: resolvedApplicationHref,
      hint: null,
      readiness: null,
    };
  }

  // --- Step 2: payout details ---
  let payoutStep: CommercialOnboardingStepState;

  const payoutVisual = mapPayoutProfileStatusToOnboardingVisual({
    status: payoutProfileStatus,
    available: capabilities.payoutDetailsAvailable,
    applicationApproved,
    legacyCommercialActive,
  });
  const payoutReviewComment = payoutProfileReviewComment?.trim() || null;

  if (payoutVisual.state === "locked") {
    payoutStep = lockedStep("payout_details", {
      hint: payoutVisual.hint,
    });
  } else if (payoutVisual.state === "coming_soon") {
    payoutStep = comingSoonStep("payout_details");
  } else if (payoutVisual.state === "completed") {
    payoutStep = {
      id: "payout_details",
      ...STEP_META.payout_details,
      state: "completed",
      hint: null,
      readiness: null,
    };
  } else {
    let payoutHint: string | null = payoutReviewComment ?? payoutVisual.hint ?? null;
    if (
      payoutProfileStatus === "needs_changes" &&
      !payoutReviewComment &&
      !payoutVisual.hint
    ) {
      payoutHint = "Нужно исправить данные для выплат.";
    }

    payoutStep = {
      id: "payout_details",
      ...STEP_META.payout_details,
      state: "active",
      statusLabel: payoutVisual.statusLabel,
      actionLabel: payoutVisual.actionLabel,
      href: payoutDetailsHref ?? undefined,
      hint: payoutHint,
      readiness: null,
    };
  }

  // --- Step 3: terms ---
  let termsStep: CommercialOnboardingStepState;

  if (!applicationApproved) {
    termsStep = lockedStep("terms_acceptance", {
      hint: "Шаг откроется после одобрения коммерческой заявки.",
    });
  } else if (!capabilities.termsAcceptanceAvailable) {
    termsStep = comingSoonStep("terms_acceptance");
  } else if (termsAccepted) {
    termsStep = {
      id: "terms_acceptance",
      ...STEP_META.terms_acceptance,
      state: "completed",
      hint: null,
      readiness: null,
    };
  } else {
    termsStep = {
      id: "terms_acceptance",
      ...STEP_META.terms_acceptance,
      state: "active",
      actionLabel: "Открыть условия",
      href: termsHref ?? undefined,
      hint: null,
      readiness: null,
    };
  }

  // --- Steps 4–7: paid product path ---
  let paidProductStep: CommercialOnboardingStepState;
  let preparePaidStep: CommercialOnboardingStepState;
  let publishPaidStep: CommercialOnboardingStepState;
  let paidPromotionStep: CommercialOnboardingStepState;

  if (paidProductComplete) {
    paidProductStep = {
      id: "paid_product",
      ...STEP_META.paid_product,
      state: "completed",
      hint: null,
      readiness: null,
    };
  } else if (!canCreatePaidProducts) {
    // Paid API/SQL gates are authoritative: onboarding authors stay locked even
    // if UI cards for payout/terms are already open.
    paidProductStep = lockedStep("paid_product", {
      hint: applicationApproved
        ? "Сначала заполните данные для выплат и примите условия сотрудничества."
        : "Сначала нужна одобренная коммерческая заявка.",
    });
  } else {
    // commercial_active / legacy commercial: paid is allowed even if historical
    // payout/terms checklist rows were never marked complete.
    paidProductStep = {
      id: "paid_product",
      ...STEP_META.paid_product,
      state: "active",
      actionLabel: "Создать платный продукт",
      href: newProductHref,
      hint: null,
      readiness: null,
    };
  }

  if (preparePaidComplete) {
    preparePaidStep = {
      id: "prepare_paid_product",
      ...STEP_META.prepare_paid_product,
      state: "completed",
      hint: null,
      readiness: buildVisiblePaidReadiness(
        focusPaidProduct?.readiness ?? publishedPaidProduct?.readiness,
      ),
    };
  } else if (!paidProductComplete) {
    preparePaidStep = lockedStep("prepare_paid_product", {
      hint: "Шаг откроется после создания платного продукта.",
    });
  } else {
    preparePaidStep = {
      id: "prepare_paid_product",
      ...STEP_META.prepare_paid_product,
      state: "active",
      actionLabel: "Проверить перед публикацией",
      href: focusPreviewHref,
      hint: null,
      readiness: buildVisiblePaidReadiness(focusPaidProduct?.readiness),
    };
  }

  if (publishPaidComplete) {
    publishPaidStep = {
      id: "publish_paid_product",
      ...STEP_META.publish_paid_product,
      state: "completed",
      actionLabel: "Открыть страницу продукта",
      href: publishedPublicHref,
      ctaExternal: true,
      hint: null,
      readiness: null,
    };
  } else if (!preparePaidComplete) {
    publishPaidStep = lockedStep("publish_paid_product", {
      hint: "Шаг откроется, когда платный продукт будет готов к публикации.",
    });
  } else {
    publishPaidStep = {
      id: "publish_paid_product",
      ...STEP_META.publish_paid_product,
      state: "active",
      actionLabel: "Перейти к публикации",
      href: focusPreviewHref,
      hint: null,
      readiness: null,
    };
  }

  if (paidPromotionComplete) {
    paidPromotionStep = {
      id: "paid_promotion",
      ...STEP_META.paid_promotion,
      state: "completed",
      hint: null,
      readiness: null,
    };
  } else if (!publishPaidComplete) {
    paidPromotionStep = lockedStep("paid_promotion", {
      hint: "Шаг откроется после публикации платного продукта.",
    });
  } else {
    paidPromotionStep = {
      id: "paid_promotion",
      ...STEP_META.paid_promotion,
      state: "active",
      actionLabel: "Создать ссылку",
      href: promotionHref,
      hint: null,
      readiness: null,
    };
  }

  // Payout + terms may be active in parallel after approval; later paid
  // steps stay sequential via prerequisite checks above.
  const steps = [
    applicationStep,
    payoutStep,
    termsStep,
    paidProductStep,
    preparePaidStep,
    publishPaidStep,
    paidPromotionStep,
  ];

  const completionFlags = [
    applicationApproved,
    payoutStepComplete,
    termsStepComplete,
    paidProductComplete,
    preparePaidComplete,
    publishPaidComplete,
    paidPromotionComplete,
  ];
  const completedCount = completionFlags.filter(Boolean).length;

  return {
    unlocked: true,
    completedCount,
    totalCount: COMMERCIAL_ONBOARDING_STEP_COUNT,
    complete: completedCount === COMMERCIAL_ONBOARDING_STEP_COUNT,
    progressMode: "count",
    steps,
    focusPaidProductId: focusPaidProduct?.id ?? null,
    publishedPaidProductId: publishedPaidProduct?.id ?? null,
    publishedPaidProductSlug: publishedPaidProduct?.slug ?? null,
  };
}
