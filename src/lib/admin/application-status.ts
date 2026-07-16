import type { AuthorApplicationStatus } from "@/lib/author-applications/types";

export const ADMIN_APPLICATION_STATUS_OPTIONS: {
  value: AuthorApplicationStatus;
  label: string;
  filterKey: string;
}[] = [
  { value: "submitted", label: "Новая", filterKey: "new" },
  { value: "in_review", label: "На рассмотрении", filterKey: "in_review" },
  { value: "needs_changes", label: "Нужно связаться", filterKey: "contact_required" },
  { value: "approved", label: "Одобрена", filterKey: "approved" },
  { value: "rejected", label: "Отклонена", filterKey: "rejected" },
  { value: "withdrawn", label: "Архив", filterKey: "archived" },
];

const STATUS_LABEL_MAP = new Map(
  ADMIN_APPLICATION_STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

const FILTER_TO_STATUS = new Map(
  ADMIN_APPLICATION_STATUS_OPTIONS.map((option) => [option.filterKey, option.value]),
);

export function getAdminApplicationStatusLabel(
  status: AuthorApplicationStatus,
): string {
  if (status === "draft") {
    return "Черновик";
  }

  return STATUS_LABEL_MAP.get(status) ?? status;
}

export function resolveAdminApplicationFilterStatus(
  filter: string | null | undefined,
): AuthorApplicationStatus | null {
  if (!filter || filter === "all") {
    return null;
  }

  const mapped = FILTER_TO_STATUS.get(filter);

  if (mapped) {
    return mapped;
  }

  const direct = filter as AuthorApplicationStatus;

  if (STATUS_LABEL_MAP.has(direct) || direct === "draft") {
    return direct;
  }

  return null;
}

export function isNewAuthorApplicationStatus(
  status: AuthorApplicationStatus,
): boolean {
  return status === "submitted";
}
