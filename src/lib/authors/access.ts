export const AUTHOR_ACCESS_STATUSES = [
  "free",
  "commercial_pending",
  "commercial",
  "suspended",
  "terminated",
] as const;

export type AuthorAccessStatus = (typeof AUTHOR_ACCESS_STATUSES)[number];

export function authorAccessAllowsPaidProducts(
  status: AuthorAccessStatus | string | null | undefined,
): boolean {
  return status === "commercial";
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
    case "commercial":
      return "Коммерческий";
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

  return "Продажи станут доступны после коммерческого подключения.";
}
