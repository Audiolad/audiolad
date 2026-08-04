import {
  COMMERCIAL_APPLICATION_FREE_PRODUCT_REQUIRED_CODE,
  COMMERCIAL_APPLICATION_FREE_PRODUCT_REQUIRED_MESSAGE,
} from "./free-product-gate";
import {
  FORMAT_PLAN_OPTIONS,
  type AuthorCommercialApplicationFieldErrors,
  type AuthorCommercialApplicationFormValues,
  type AuthorCommercialApplicationRow,
} from "./types";

export const AUTHOR_COMMERCIAL_APPLICATION_LIMITS = {
  plannedProductsMin: 20,
  plannedProductsMax: 4000,
  topicsMin: 2,
  topicsMax: 2000,
  formatPlanMin: 2,
  formatPlanMax: 2000,
  teamCommentMax: 4000,
} as const;

function trimValue(value: unknown): string {
  return String(value ?? "").trim();
}

function readBooleanFlag(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === 1;
}

export function normalizeCommercialApplicationFormValues(
  input: Partial<AuthorCommercialApplicationFormValues> | Record<string, unknown>,
): AuthorCommercialApplicationFormValues {
  const record = input as Record<string, unknown>;

  return {
    plannedProducts: trimValue(
      record.plannedProducts ?? record.planned_products,
    ),
    topics: trimValue(record.topics),
    formatPlan: trimValue(record.formatPlan ?? record.format_plan),
    rightsConfirmation: readBooleanFlag(
      record.rightsConfirmation ?? record.rights_confirmation,
    ),
    teamComment: trimValue(record.teamComment ?? record.team_comment),
  };
}

export function rowToCommercialApplicationFormValues(
  row: Pick<
    AuthorCommercialApplicationRow,
    | "planned_products"
    | "topics"
    | "format_plan"
    | "rights_confirmation"
    | "team_comment"
  >,
): AuthorCommercialApplicationFormValues {
  return {
    plannedProducts: row.planned_products ?? "",
    topics: row.topics ?? "",
    formatPlan: row.format_plan ?? "",
    rightsConfirmation: row.rights_confirmation === true,
    teamComment: row.team_comment ?? "",
  };
}

export function validateCommercialApplicationFormValues(
  values: AuthorCommercialApplicationFormValues,
  options?: { requireSubmitRules?: boolean },
): AuthorCommercialApplicationFieldErrors {
  const errors: AuthorCommercialApplicationFieldErrors = {};
  const requireSubmitRules = options?.requireSubmitRules ?? true;
  const limits = AUTHOR_COMMERCIAL_APPLICATION_LIMITS;

  if (values.plannedProducts.length > limits.plannedProductsMax) {
    errors.plannedProducts = `Слишком длинное описание (до ${limits.plannedProductsMax} символов).`;
  } else if (
    requireSubmitRules &&
    values.plannedProducts.length < limits.plannedProductsMin
  ) {
    errors.plannedProducts = `Опишите планируемые платные продукты (минимум ${limits.plannedProductsMin} символов).`;
  }

  if (values.topics.length > limits.topicsMax) {
    errors.topics = `Слишком длинный список тем (до ${limits.topicsMax} символов).`;
  } else if (requireSubmitRules && values.topics.length < limits.topicsMin) {
    errors.topics = `Укажите темы (минимум ${limits.topicsMin} символа).`;
  }

  if (values.formatPlan.length > limits.formatPlanMax) {
    errors.formatPlan = `Слишком длинное описание формата (до ${limits.formatPlanMax} символов).`;
  } else if (requireSubmitRules) {
    if (!values.formatPlan) {
      errors.formatPlan = "Выберите формат материалов.";
    } else if (
      !(FORMAT_PLAN_OPTIONS as readonly string[]).includes(values.formatPlan) &&
      values.formatPlan.length < limits.formatPlanMin
    ) {
      errors.formatPlan = "Выберите формат материалов.";
    }
  }

  if (requireSubmitRules && !values.rightsConfirmation) {
    errors.rightsConfirmation =
      "Подтвердите, что у вас есть права на размещение материалов.";
  }

  if (values.teamComment.length > limits.teamCommentMax) {
    errors.teamComment = `Комментарий слишком длинный (до ${limits.teamCommentMax} символов).`;
  }

  return errors;
}

export function hasCommercialApplicationFieldErrors(
  errors: AuthorCommercialApplicationFieldErrors,
): boolean {
  return Object.keys(errors).length > 0;
}

export function mapCommercialApplicationRpcError(message: string): string {
  if (message.includes("forbidden") || message.includes("not_authenticated")) {
    return "Недостаточно прав для этого действия.";
  }

  if (message.includes("author_not_found")) {
    return "Авторское пространство не найдено.";
  }

  if (message.includes("commercial_application_not_needed")) {
    return "Коммерческий статус уже открыт — заявка не требуется.";
  }

  if (message.includes("commercial_application_not_editable")) {
    return "Заявку нельзя редактировать в текущем статусе.";
  }

  if (message.includes("commercial_application_already_active")) {
    return "Заявка уже отправлена и ожидает рассмотрения.";
  }

  if (message.includes("commercial_application_legacy_pending")) {
    return "Коммерческий доступ уже на рассмотрении. Новую заявку создавать не нужно.";
  }

  if (message.includes("commercial_application_invalid_planned_products")) {
    return `Опишите планируемые платные продукты (минимум ${AUTHOR_COMMERCIAL_APPLICATION_LIMITS.plannedProductsMin} символов).`;
  }

  if (message.includes("commercial_application_invalid_topics")) {
    return `Укажите темы (минимум ${AUTHOR_COMMERCIAL_APPLICATION_LIMITS.topicsMin} символа).`;
  }

  if (message.includes("commercial_application_invalid_format_plan")) {
    return "Выберите формат материалов.";
  }

  if (message.includes("commercial_application_rights_required")) {
    return "Подтвердите, что у вас есть права на размещение материалов.";
  }

  if (message.includes(COMMERCIAL_APPLICATION_FREE_PRODUCT_REQUIRED_CODE)) {
    return COMMERCIAL_APPLICATION_FREE_PRODUCT_REQUIRED_MESSAGE;
  }

  if (message.includes("application_not_found")) {
    return "Заявка не найдена.";
  }

  if (message.includes("application_transition_not_allowed")) {
    return "Переход статуса недопустим.";
  }

  if (message.includes("applicant_comment_required")) {
    return "Укажите комментарий для заявителя.";
  }

  if (message.includes("author_access_transition_not_allowed")) {
    return "Изменение статуса доступа недопустимо.";
  }

  return "Не удалось выполнить действие.";
}
