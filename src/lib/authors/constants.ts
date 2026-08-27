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
export const MAX_AUTHOR_PROFILE_TOPICS = 3;
export const AUTHOR_PRODUCTS_INITIAL_COUNT = 8;
export const MAX_AUTHOR_CONTACTS = 6;
export const MAX_AUTHOR_CONTACT_TITLE_LENGTH = 120;
export const MAX_AUTHOR_CONTACT_DESCRIPTION_LENGTH = 120;
export const MAX_AUTHOR_CONTACT_URL_LENGTH = 512;

export const AUTHOR_CONTACT_PLATFORMS = ["telegram", "max", "custom"] as const;

export type AuthorContactPlatform = (typeof AUTHOR_CONTACT_PLATFORMS)[number];

export const AUTHOR_CONTACT_PLATFORM_LABELS: Record<AuthorContactPlatform, string> = {
  telegram: "Telegram",
  max: "MAX",
  custom: "Другое",
};

export const AUTHOR_CONTACT_PLATFORM_PUBLIC_LABELS: Record<
  AuthorContactPlatform,
  string
> = {
  telegram: "Telegram",
  max: "MAX",
  custom: "Ссылка",
};

export const AUTHOR_CONTACT_STANDARD_ICON_SRC: Record<
  Exclude<AuthorContactPlatform, "custom">,
  string
> = {
  telegram: "/school/messengers/telegram.png",
  max: "/school/messengers/max.png",
};

export const AUTHOR_CONTACT_CUSTOM_ICON_SRC = "/authors/contacts/custom.svg";

export const AUTHOR_ASSETS_BUCKET = "author-assets";
