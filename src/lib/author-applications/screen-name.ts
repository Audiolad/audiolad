export const APPLICATION_NAME_SYNC_FAILED_MESSAGE =
  "Имя пространства сохранено, но заявка не обновилась. Повторите сохранение.";

/**
 * After approval the public name is the author workspace name.
 * The registration name on the application stays as history until a rename
 * copies it, and screens must not prefer that older text.
 */
export function authorApplicationScreenName(input: {
  status: string;
  displayName: string;
  authorName?: string | null;
}): string {
  if (input.status === "approved") {
    const authorName = input.authorName?.trim();
    if (authorName) {
      return authorName;
    }
  }

  return input.displayName;
}
