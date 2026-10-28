export type ChangeAuthorSlugAdminState = {
  ok: boolean;
  step?: "preview" | "done";
  message?: string;
  error?: string;
  authorId?: string;
  authorName?: string;
  previousSlug?: string;
  slug?: string;
};

export const CHANGE_AUTHOR_SLUG_ADMIN_INITIAL_STATE: ChangeAuthorSlugAdminState =
  { ok: false };

export const STALE_SERVER_ACTION_MESSAGE =
  "Сайт обновился – перезагрузите страницу";

export const AUTHOR_SLUG_PREVIEW_ERROR =
  "Не удалось показать подтверждение. Попробуйте ещё раз.";

export const AUTHOR_SLUG_CONFIRM_ERROR =
  "Не удалось обновить slug. Попробуйте ещё раз.";

export function authorSlugUpdatedMessage(
  previousSlug: string,
  nextSlug: string,
): string {
  return `Slug обновлён: ${previousSlug} – ${nextSlug}`;
}

export function isStaleServerActionError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /Failed to find Server Action/i.test(message);
}
