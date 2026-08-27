import {
  authorAccessAllowsContentMutations,
  authorAccessAllowsPaidProducts,
  getPaidPricingDisabledReason,
  type AuthorAccessStatus,
} from "@/lib/authors/access";
import {
  canSubmitPracticeForModeration,
  getVisibleAuthorProductStatus,
  getVisibleAuthorProductStatusLabel,
  VISIBLE_AUTHOR_PRODUCT_STATUS,
} from "@/lib/author-products/moderation";

export type AuthorSubmitUiAction =
  | "submit"
  | "resubmit"
  | "publish"
  | "hidden"
  | "disabled";

export type AuthorSubmitEligibility = {
  visibleStatus: string;
  visibleStatusLabel: string;
  canMutateContent: boolean;
  canEditPublicFields: boolean;
  canBypassProductModeration: boolean;
  canUsePaidPricing: boolean;
  canSubmitByLifecycle: boolean;
  action: AuthorSubmitUiAction;
  actionLabel: string;
  enabled: boolean;
  reason: string;
  commercialBlock: { code: string; message: string } | null;
};

export type AuthorSubmitEligibilityInput = {
  status: string;
  moderationStatus: string | null | undefined;
  deletedAt?: string | null;
  canBypassProductModeration: boolean;
  accessStatus: AuthorAccessStatus | string | null | undefined;
  isFree: boolean;
  price: number;
};

function resolveCommercialBlock(input: AuthorSubmitEligibilityInput): {
  code: string;
  message: string;
} | null {
  if (input.isFree && input.price === 0) {
    return null;
  }

  if (authorAccessAllowsPaidProducts(input.accessStatus)) {
    return null;
  }

  return {
    code: "paid_products_not_allowed",
    message:
      getPaidPricingDisabledReason(
        (input.accessStatus ?? "free") as AuthorAccessStatus,
      ) ??
      "Отправка будет отклонена: платные продукты недоступны при текущем статусе авторского доступа.",
  };
}

/**
 * Mirrors AuthorProductForm submit/publish button visibility.
 * Diagnosis only — does not change the form.
 */
export function evaluateAuthorSubmitEligibility(
  input: AuthorSubmitEligibilityInput,
): AuthorSubmitEligibility {
  const visibleStatus = getVisibleAuthorProductStatus({
    status: input.status,
    moderationStatus: input.moderationStatus,
    deletedAt: input.deletedAt,
  });
  const visibleStatusLabel = getVisibleAuthorProductStatusLabel(visibleStatus);
  const isDraft = visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.DRAFT;
  const needsChanges =
    visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.CHANGES_REQUESTED;
  const isSubmitted =
    visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.SUBMITTED;
  const isPublished =
    visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.PUBLISHED;
  const isUnpublished =
    visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.UNPUBLISHED;
  const isDeleted = visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.DELETED;

  const canMutateContent = authorAccessAllowsContentMutations(input.accessStatus);
  const canEditPublicFields =
    canMutateContent &&
    (isDraft ||
      needsChanges ||
      (input.canBypassProductModeration && (isPublished || isUnpublished)));
  const canUsePaidPricing = authorAccessAllowsPaidProducts(input.accessStatus);
  const canSubmitByLifecycle = canSubmitPracticeForModeration({
    status: input.status,
    moderationStatus: input.moderationStatus,
    deletedAt: input.deletedAt,
  });
  const commercialBlock = resolveCommercialBlock(input);

  const base = {
    visibleStatus,
    visibleStatusLabel,
    canMutateContent,
    canEditPublicFields,
    canBypassProductModeration: input.canBypassProductModeration,
    canUsePaidPricing,
    canSubmitByLifecycle,
    commercialBlock,
  };

  if (isDeleted) {
    return {
      ...base,
      action: "hidden",
      actionLabel: "Скрыта",
      enabled: false,
      reason: "Кнопка отправки скрыта: продукт удалён.",
    };
  }

  if (!canMutateContent) {
    const action: AuthorSubmitUiAction =
      isDraft && !input.canBypassProductModeration
        ? "disabled"
        : needsChanges
          ? "disabled"
          : "hidden";

    return {
      ...base,
      action,
      actionLabel:
        action === "disabled"
          ? needsChanges
            ? "Повторно отправить на модерацию"
            : "Отправить на модерацию"
          : "Скрыта",
      enabled: false,
      reason:
        "Кнопка недоступна: авторский доступ приостановлен или завершён (canEditPublicFields = false).",
    };
  }

  if (isDraft && input.canBypassProductModeration) {
    return {
      ...base,
      action: "publish",
      actionLabel: "Опубликовать",
      enabled: true,
      reason:
        "Кнопка «Отправить на модерацию» скрыта: у автора включён обход модерации, форма показывает «Опубликовать».",
    };
  }

  if (isDraft) {
    return {
      ...base,
      action: canEditPublicFields ? "submit" : "disabled",
      actionLabel: "Отправить на модерацию",
      enabled: canEditPublicFields,
      reason: canEditPublicFields
        ? commercialBlock
          ? `Кнопка «Отправить на модерацию» видна, но отправка будет отклонена: ${commercialBlock.code} при access_status=${input.accessStatus ?? "—"}.`
          : "Кнопка «Отправить на модерацию» видна и активна."
        : "Кнопка «Отправить на модерацию» неактивна: публичные поля нельзя редактировать.",
    };
  }

  if (needsChanges) {
    return {
      ...base,
      action: canEditPublicFields ? "resubmit" : "disabled",
      actionLabel: "Повторно отправить на модерацию",
      enabled: canEditPublicFields,
      reason: canEditPublicFields
        ? commercialBlock
          ? `Кнопка повторной отправки видна, но отправка будет отклонена: ${commercialBlock.code} при access_status=${input.accessStatus ?? "—"}.`
          : "Кнопка «Повторно отправить на модерацию» видна и активна."
        : "Кнопка повторной отправки неактивна: публичные поля нельзя редактировать.",
    };
  }

  if (isSubmitted) {
    return {
      ...base,
      action: "hidden",
      actionLabel: "Скрыта",
      enabled: false,
      reason:
        "Кнопка отправки скрыта: status/moderation_status = submitted, форма показывает только «Отозвать с модерации».",
    };
  }

  if (isPublished) {
    return {
      ...base,
      action: "hidden",
      actionLabel: "Скрыта",
      enabled: false,
      reason:
        "Кнопка отправки скрыта: продукт опубликован. Форма показывает снятие с публикации и «Снять и редактировать».",
    };
  }

  if (isUnpublished) {
    return {
      ...base,
      action: "hidden",
      actionLabel: "Скрыта",
      enabled: false,
      reason:
        "Кнопка отправки скрыта: продукт снят с публикации и одобрен. Форма показывает «Перейти к редактированию» и повторную публикацию.",
    };
  }

  return {
    ...base,
    action: "hidden",
    actionLabel: "Скрыта",
    enabled: false,
    reason: "Кнопка отправки скрыта при текущем сочетании статусов.",
  };
}
