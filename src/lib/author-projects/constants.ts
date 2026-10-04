/** Cookie for sticky selected author project (slug). */
export const AUTHOR_PROJECT_COOKIE = "audiolad_author_project";

export const DEFAULT_AUTHOR_PROJECT_LIMIT = 1;
export const PREMIUM_AUTHOR_PROJECT_LIMIT = 3;

export const AUTHOR_PROJECT_NAME_MIN = 2;
export const AUTHOR_PROJECT_NAME_MAX = 30;
export const AUTHOR_PROJECT_NAME_TOO_LONG_ERROR =
  `Название проекта — не более ${AUTHOR_PROJECT_NAME_MAX} символов`;
export const AUTHOR_PROJECT_DESCRIPTION_MAX = 280;
export const AUTHOR_PROJECT_SLUG_MAX = 80;
