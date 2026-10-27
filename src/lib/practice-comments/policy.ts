import {
  PRODUCT_KIND,
  type ProductKind,
} from "@/lib/author-products/product-kind";
import {
  CATALOG_PUBLICATION_CLASSES,
  type PublicationClass,
} from "@/lib/catalog/dto";
import { isPracticePubliclyAvailable } from "@/lib/products/scheduled-publication";

export type ListenerCommentPracticeGate = {
  practiceId: string;
  authorId: string;
  title: string;
  authorSlug: string;
  productSlug: string;
  authorName: string | null;
  productKind: string | null;
  catalogSection: string | null;
  status: string | null;
  publishedAt: string | null;
  scheduledPublishAt: string | null;
  deletedAt: string | null;
  /** listed and unlisted are public pages. selected_users is a private allowlist. */
  catalogVisibility: string | null;
};

/**
 * One public product page. Kind, publication class, format and catalog shelf
 * are labels. None of them decide whether a listener can leave an impression.
 * Playlists are a separate listing class and are not products.
 */
export type ListenerCommentProductSurface = {
  id: string;
  label: string;
  productKind: ProductKind | null;
  publicationClass: PublicationClass | null;
  catalogSection: string | null;
  format: string | null;
};

export const LISTENER_COMMENT_PRODUCT_SURFACES: readonly ListenerCommentProductSurface[] =
  [
    {
      id: "practice",
      label: "Аудиопрактика",
      productKind: PRODUCT_KIND.PRACTICE,
      publicationClass: "practice",
      catalogSection: "meditations",
      format: "Аудиопрактика",
    },
    {
      id: "meditation",
      label: "Медитация",
      productKind: PRODUCT_KIND.PRACTICE,
      publicationClass: "practice",
      catalogSection: "meditations",
      format: "Медитация",
    },
    {
      id: "audio_story",
      label: "Аудиоистория",
      productKind: PRODUCT_KIND.PRACTICE,
      publicationClass: "practice",
      catalogSection: "stories",
      format: "Аудиоистория",
    },
    {
      id: "course",
      label: "Аудиокурс",
      productKind: PRODUCT_KIND.PRACTICE,
      publicationClass: "course",
      catalogSection: "education",
      format: "Аудиокурс",
    },
    {
      id: "audiobook",
      label: "Аудиокнига",
      productKind: PRODUCT_KIND.PRACTICE,
      publicationClass: "audiobook",
      catalogSection: "books",
      format: "Аудиокнига",
    },
    {
      id: "program",
      label: "Программа аудиопрактик",
      productKind: PRODUCT_KIND.PRACTICE,
      publicationClass: "practice",
      catalogSection: "meditations",
      format: "Программа аудиопрактик",
    },
    {
      id: "lecture",
      label: "Лекция",
      productKind: PRODUCT_KIND.PRACTICE,
      publicationClass: "practice",
      catalogSection: "education",
      format: "Лекция",
    },
    {
      id: "podcast",
      label: "Авторский аудиоподкаст",
      productKind: PRODUCT_KIND.PRACTICE,
      publicationClass: "practice",
      catalogSection: "meditations",
      format: "Авторский аудиоподкаст",
    },
    {
      id: "music",
      label: "Музыка",
      productKind: PRODUCT_KIND.MUSIC,
      publicationClass: "release",
      catalogSection: "music",
      format: "Музыка",
    },
    {
      id: "audio_post",
      label: "Аудиопост",
      productKind: PRODUCT_KIND.AUDIO_POST,
      publicationClass: "post",
      catalogSection: null,
      format: "Аудиопост",
    },
    {
      id: "audio_ether",
      label: "Аудиоэфир",
      productKind: PRODUCT_KIND.AUDIO_POST,
      publicationClass: "post",
      catalogSection: null,
      format: "Аудиоэфир",
    },
  ];

export const LISTENER_COMMENT_PUBLICATION_CLASSES = CATALOG_PUBLICATION_CLASSES;

/**
 * Product type is not a gate. A published product of any kind accepts
 * impressions when the page itself is public. The catalog shelf, including
 * music and stories, is ignored. Private allowlist products are not.
 */
export function isListenerCommentProductKind(input: {
  productKind: string | null | undefined;
  catalogSection?: string | null | undefined;
}): boolean {
  void input.productKind;
  void input.catalogSection;
  return true;
}

/** Direct-link and catalog pages. selected_users stays behind the allowlist. */
export function isPublicCommentCatalogVisibility(
  value: string | null | undefined,
): boolean {
  return value === "listed" || value === "unlisted";
}

export function practiceAcceptsListenerComments(
  input: {
    productKind: string | null | undefined;
    catalogSection: string | null | undefined;
    catalogVisibility?: string | null;
    status: string | null | undefined;
    publishedAt?: string | null;
    scheduledPublishAt?: string | null;
    deletedAt?: string | null;
    now?: Date;
  },
): boolean {
  if (input.deletedAt) {
    return false;
  }
  if (!isPublicCommentCatalogVisibility(input.catalogVisibility)) {
    return false;
  }
  if (!isListenerCommentProductKind(input)) {
    return false;
  }
  return isPracticePubliclyAvailable({
    status: input.status,
    publishedAt: input.publishedAt,
    scheduledPublishAt: input.scheduledPublishAt,
    now: input.now,
  });
}
