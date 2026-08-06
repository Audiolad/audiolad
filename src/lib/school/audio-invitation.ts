import {
  buildListenApiBase,
  buildPracticeCanonicalUrl,
  buildPracticePublicPath,
} from "@/lib/products/paths";

/** Published invitation audio post — school landing embed only. */
export const SCHOOL_INVITATION_AUTHOR_SLUG = "sergey-petrov";
export const SCHOOL_INVITATION_PRODUCT_SLUG =
  "priglashenie-v-shkolu-audiopraktik-2";

export const SCHOOL_INVITATION_PUBLIC_PATH = buildPracticePublicPath(
  SCHOOL_INVITATION_AUTHOR_SLUG,
  SCHOOL_INVITATION_PRODUCT_SLUG,
);

export const SCHOOL_INVITATION_CANONICAL_URL = buildPracticeCanonicalUrl(
  SCHOOL_INVITATION_AUTHOR_SLUG,
  SCHOOL_INVITATION_PRODUCT_SLUG,
);

export const SCHOOL_INVITATION_LISTEN_API_BASE = buildListenApiBase(
  SCHOOL_INVITATION_AUTHOR_SLUG,
  SCHOOL_INVITATION_PRODUCT_SLUG,
);

export const SCHOOL_INVITATION_LABEL = "Аудиопост";
export const SCHOOL_INVITATION_TITLE = "Приглашение в Школу Аудиопрактик";
export const SCHOOL_INVITATION_SUBTITLE =
  "Почему появилась Школа Аудиопрактик и кого я хочу пригласить в это путешествие";
export const SCHOOL_INVITATION_AUTHOR_NAME = "Сергей Петров";
export const SCHOOL_INVITATION_EXTRA = "Личное аудиоприглашение";
