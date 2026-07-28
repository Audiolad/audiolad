export const AUTHOR_ACCESS_STATUSES = [
  "free",
  "commercial_pending",
  "commercial_onboarding",
  "commercial_active",
  "commercial_suspended",
  /** @deprecated Legacy synonym of commercial_active; do not assign to new rows. */
  "commercial",
  "suspended",
  "terminated",
] as const;

export type AuthorAccessStatus = (typeof AUTHOR_ACCESS_STATUSES)[number];

/** True when status is the live paid tier or the temporary legacy synonym. */
export function isAuthorCommercialActiveAccess(
  status: AuthorAccessStatus | string | null | undefined,
): boolean {
  return status === "commercial_active" || status === "commercial";
}

export function isAuthorCommercialOnboardingAccess(
  status: AuthorAccessStatus | string | null | undefined,
): boolean {
  return status === "commercial_onboarding";
}

/** Approved commercial path (onboarding, active, suspended, or legacy). */
export function isAuthorCommercialApprovedAccess(
  status: AuthorAccessStatus | string | null | undefined,
): boolean {
  return (
    status === "commercial_onboarding" ||
    status === "commercial_active" ||
    status === "commercial_suspended" ||
    status === "commercial"
  );
}

export function authorAccessAllowsPaidProducts(
  status: AuthorAccessStatus | string | null | undefined,
): boolean {
  return isAuthorCommercialActiveAccess(status);
}

export function authorAccessAllowsContentMutations(
  status: AuthorAccessStatus | string | null | undefined,
): boolean {
  return status !== "suspended" && status !== "terminated";
}

export function getAuthorAccessStatusLabel(status: AuthorAccessStatus): string {
  switch (status) {
    case "free":
      return "Бесплатный";
    case "commercial_pending":
      return "Коммерческое подключение";
    case "commercial_onboarding":
      return "Коммерческий онбординг";
    case "commercial_active":
    case "commercial":
      return "Коммерческий";
    case "commercial_suspended":
      return "Коммерция приостановлена";
    case "suspended":
      return "Приостановлен";
    case "terminated":
      return "Завершён";
    default:
      return status;
  }
}

export function getAuthorAccessBannerMessage(
  status: AuthorAccessStatus,
): string | null {
  switch (status) {
    case "free":
    case "commercial_pending":
      return "Бесплатный авторский аккаунт. Вы можете публиковать бесплатные материалы. Продажи станут доступны после коммерческого подключения.";
    case "commercial_onboarding":
      return "Коммерческая заявка одобрена. Примите Авторские условия сотрудничества, чтобы открыть платные продукты.";
    case "commercial_suspended":
      return "Коммерческие возможности временно приостановлены. Бесплатные материалы по-прежнему доступны.";
    case "suspended":
      return "Авторский доступ приостановлен. Изменение и публикация материалов временно недоступны.";
    case "terminated":
      return "Авторский доступ завершён. Изменение и публикация материалов недоступны.";
    default:
      return null;
  }
}

export function getPaidPricingDisabledReason(
  status: AuthorAccessStatus,
): string | null {
  if (authorAccessAllowsPaidProducts(status)) {
    return null;
  }

  if (status === "suspended" || status === "terminated") {
    return "Изменение материалов недоступно: авторский доступ приостановлен.";
  }

  if (status === "commercial_onboarding") {
    return "Сначала примите Авторские условия сотрудничества.";
  }

  if (status === "commercial_suspended") {
    return "Коммерческие возможности временно приостановлены.";
  }

  return "Продажи станут доступны после коммерческого подключения.";
}
