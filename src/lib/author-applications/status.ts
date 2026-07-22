import type {
  AuthorApplicationStatus,
  BecomeAuthorAudience,
  ProfileApplicationVariant,
} from "./types";

export const EDITABLE_AUTHOR_APPLICATION_STATUSES: AuthorApplicationStatus[] = [
  "draft",
  "needs_changes",
];

export const NON_WITHDRAWN_AUTHOR_APPLICATION_STATUSES: AuthorApplicationStatus[] =
  [
    "draft",
    "submitted",
    "in_review",
    "needs_changes",
    "approved",
    "rejected",
  ];

export function isEditableAuthorApplicationStatus(
  status: AuthorApplicationStatus,
): boolean {
  return EDITABLE_AUTHOR_APPLICATION_STATUSES.includes(status);
}

export function canSubmitAuthorApplicationStatus(
  status: AuthorApplicationStatus,
): boolean {
  return status === "draft" || status === "needs_changes";
}

export function canUpdateAuthorApplicationContacts(
  status: AuthorApplicationStatus,
): boolean {
  return status === "submitted" || status === "in_review";
}

export function normalizeAuthorApplicationStatus(
  value: string | null | undefined,
): AuthorApplicationStatus | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim() as AuthorApplicationStatus;

  if (
    normalized === "draft" ||
    normalized === "submitted" ||
    normalized === "in_review" ||
    normalized === "needs_changes" ||
    normalized === "approved" ||
    normalized === "rejected" ||
    normalized === "withdrawn"
  ) {
    return normalized;
  }

  return null;
}

export function resolveBecomeAuthorAudience(input: {
  isAuthenticated: boolean;
  workspaceCount: number;
  applicationStatus: AuthorApplicationStatus | null;
}): BecomeAuthorAudience {
  if (input.workspaceCount > 0) {
    return "author";
  }

  if (!input.isAuthenticated) {
    return "guest";
  }

  if (input.applicationStatus) {
    return "application";
  }

  return "listener";
}

export function resolveProfileApplicationVariant(input: {
  workspaceCount: number;
  applicationStatus: AuthorApplicationStatus | null;
}): ProfileApplicationVariant | null {
  if (input.workspaceCount > 0) {
    return null;
  }

  if (!input.applicationStatus) {
    return "none";
  }

  switch (input.applicationStatus) {
    case "draft":
      return "draft";
    case "submitted":
      return "submitted";
    case "in_review":
      return "in_review";
    case "needs_changes":
      return "needs_changes";
    case "approved":
      return "approved_pending_access";
    case "rejected":
      return "rejected";
    default:
      return null;
  }
}

export function getAuthorApplicationStatusTitle(
  status: AuthorApplicationStatus,
  hasWorkspace: boolean,
): string {
  if (hasWorkspace) {
    return "Вы уже являетесь автором АудиоЛада";
  }

  switch (status) {
    case "draft":
      return "Черновик заявки";
    case "submitted":
      return "Заявка отправлена";
    case "in_review":
      return "Заявка рассматривается";
    case "needs_changes":
      return "Нужно уточнить информацию";
    case "approved":
      return "Заявка одобрена";
    case "rejected":
      return "Заявка не одобрена";
    case "withdrawn":
      return "Заявка отозвана";
    default:
      return "Статус заявки";
  }
}

export function getAuthorApplicationStatusDescription(
  status: AuthorApplicationStatus,
  hasWorkspace: boolean,
): string {
  if (hasWorkspace) {
    return "Откройте кабинет автора, чтобы управлять материалами и продуктами.";
  }

  switch (status) {
    case "draft":
      return "Заполните форму и отправьте заявку, когда будете готовы.";
    case "submitted":
      return "Мы познакомимся с вашим опытом и планируемыми материалами. Статус можно посмотреть здесь и в профиле.";
    case "in_review":
      return "Команда АудиоЛада знакомится с вашей заявкой. Мы свяжемся с вами при необходимости.";
    case "needs_changes":
      return "Пожалуйста, дополните заявку и отправьте её снова.";
    case "approved":
      return hasWorkspace
        ? "Заявка одобрена. Кабинет автора уже доступен."
        : "Заявка одобрена. Кабинет автора откроется после создания авторского пространства.";
    case "rejected":
      return "К сожалению, мы не можем одобрить заявку в текущем виде.";
    case "withdrawn":
      return "Вы можете подать новую заявку, если захотите вернуться к этому позже.";
    default:
      return "";
  }
}

export function shouldShowAuthorApplicationForm(input: {
  workspaceCount: number;
  applicationStatus: AuthorApplicationStatus | null;
}): boolean {
  if (input.workspaceCount > 0) {
    return false;
  }

  if (!input.applicationStatus) {
    return true;
  }

  return isEditableAuthorApplicationStatus(input.applicationStatus);
}

export function blocksNewAuthorApplication(
  applicationStatus: AuthorApplicationStatus | null,
): boolean {
  return (
    applicationStatus !== null && applicationStatus !== "withdrawn"
  );
}
