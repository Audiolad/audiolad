import { isMusicProductKind, isAudioPostProductKind, normalizeProductKind, PRODUCT_KIND } from "@/lib/author-products/product-kind";
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
};

/**
 * Product type only. The catalog shelf (`catalog_section`, including `music`)
 * does not decide this: an older practice can sit on the music shelf and
 * still be a practice. Music and audio posts stay excluded.
 */
export function isListenerCommentProductKind(input: {
  productKind: string | null | undefined;
  catalogSection?: string | null | undefined;
}): boolean {
  void input.catalogSection;
  if (isMusicProductKind(input.productKind) || isAudioPostProductKind(input.productKind)) {
    return false;
  }
  return normalizeProductKind(input.productKind) === PRODUCT_KIND.PRACTICE;
}

export function practiceAcceptsListenerComments(
  input: {
    productKind: string | null | undefined;
    catalogSection: string | null | undefined;
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
