export const AUTHOR_TYPES = ["person", "project", "studio"] as const;

export type AuthorType = (typeof AUTHOR_TYPES)[number];

export const AUTHOR_TYPE_LABELS: Record<AuthorType, string> = {
  person: "Личный автор",
  project: "Проект",
  studio: "Студия",
};

export const MAX_SHORT_BIO_LENGTH = 180;
export const MAX_FULL_BIO_LENGTH = 700;
export const MAX_SHORT_POSITIONING_LENGTH = 100;
export const MAX_FEATURED_PRODUCTS = 5;
export const MAX_AUTHOR_PROFILE_TOPICS = 6;
export const AUTHOR_PRODUCTS_INITIAL_COUNT = 8;

export const AUTHOR_ASSETS_BUCKET = "author-assets";
