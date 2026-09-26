/**
 * Author project / workspace display names must be written in Russian.
 * ASCII Latin A–Z / a–z are rejected. Cyrillic, spaces, digits, and
 * ordinary title punctuation stay allowed.
 *
 * This module is the application rule. The database calls the same
 * character class from public.assert_author_project_name_cyrillic.
 */

export const AUTHOR_PROJECT_NAME_LATIN_CLASS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export const AUTHOR_PROJECT_NAME_CYRILLIC_HINT =
  "Название проекта – только на русском языке, кириллицей.";

export const AUTHOR_PROJECT_NAME_CYRILLIC_PLACEHOLDER =
  "Например: Музыка для души";

export const AUTHOR_PROJECT_NAME_LATIN_ERROR =
  "Используйте только русские буквы. Название проекта должно быть написано кириллицей.";

const AUTHOR_PROJECT_NAME_LATIN_LETTERS = new RegExp(
  `[${AUTHOR_PROJECT_NAME_LATIN_CLASS}]`,
);

export function authorProjectNameHasLatinLetters(name: string): boolean {
  return AUTHOR_PROJECT_NAME_LATIN_LETTERS.test(name);
}

/** Shared rule for every author project / workspace name save. */
export function getAuthorProjectNameCyrillicError(name: string): string | null {
  if (authorProjectNameHasLatinLetters(name)) {
    return AUTHOR_PROJECT_NAME_LATIN_ERROR;
  }

  return null;
}
