/**
 * AudioSprint v1 «Осень звучит».
 *
 * Membership and labels only. Occupancy stays on seo_query_reservations.
 * Practice reservation and product linking stay on the PR #698 path
 * (publication_class=practice). This module does not widen that gate.
 */

import { buildAuthorProductCreateHref } from "@/lib/seo-queries/reservation-product-create-href";
import {
  isSeoActiveReservationLimitReached,
  type SeoQueryLifecycle,
} from "@/lib/seo-queries/types";

export const AUDIO_SPRINT_OSEN_ZVUCHIT_SLUG = "osen-zvuchit-2026";
export const AUDIO_SPRINT_OSEN_ZVUCHIT_TITLE = "Осень звучит";
export const AUDIO_SPRINT_OSEN_ZVUCHIT_DESCRIPTION =
  "Выберите свободный запрос и создайте по нему бесплатный аудиопродукт в каталог. Музыка публикуется как релиз, медитации и практики — как практика.";

/** First release shows the initial pool only. Reserve stays hidden. */
export const reservePoolEnabled = false;

export const AUDIO_SPRINT_AUTHOR_GROUPS = ["music", "voice"] as const;

export type AudioSprintAuthorGroup = (typeof AUDIO_SPRINT_AUTHOR_GROUPS)[number];

export const AUDIO_SPRINT_GROUP_LABEL: Record<AudioSprintAuthorGroup, string> = {
  music: "Музыка",
  voice: "Медитации и практики",
};

export type AudioSprintPool = "initial" | "reserve";

export type AudioSprintQueryCard = {
  id: string;
  queryText: string;
  authorGroup: AudioSprintAuthorGroup;
  pool: AudioSprintPool;
  lifecycle: SeoQueryLifecycle;
  reservationId: string | null;
  expiresAt: string | null;
  productId: string | null;
};

export type AudioSprintTitleLock = {
  queryText: string;
};

export const AUDIO_SPRINT_TITLE_LOCKED_CODE = "audio_sprint_title_locked";
export const AUDIO_SPRINT_TITLE_LOCKED_MESSAGE =
  "Название продукта спринта совпадает с поисковым запросом и не меняется.";

export const AUDIO_SPRINT_MUST_BE_FREE_CODE = "audio_sprint_must_be_free";
export const AUDIO_SPRINT_MUST_BE_FREE_MESSAGE =
  "Продукт спринта можно отправить на модерацию только бесплатным.";

export const AUDIO_SPRINT_MUST_BE_LISTED_CODE = "audio_sprint_must_be_listed";
export const AUDIO_SPRINT_MUST_BE_LISTED_MESSAGE =
  "Продукт спринта должен быть открыт в каталоге.";

export const AUDIO_SPRINT_SEO_REQUIRED_CODE = "audio_sprint_seo_required";
export const AUDIO_SPRINT_SEO_REQUIRED_MESSAGE =
  "Заполните подназвание, описание, заголовок и описание для поиска, ровно 3 пункта «Как слушать / Как проходить», ровно 3 вопроса и ответа и обложку.";

export const AUDIO_SPRINT_CLASS_MISMATCH_CODE = "audio_sprint_class_mismatch";
export const AUDIO_SPRINT_CLASS_MISMATCH_MESSAGE =
  "Класс продукта не соответствует разделу спринта. Музыкальный запрос публикуется как релиз, голосовой — как практика.";

/** Packaging contract from AuthorSeoPromptBuilder: exactly three how-to items and three Q&A. */
export const AUDIO_SPRINT_USAGE_ITEM_COUNT = 3;
export const AUDIO_SPRINT_FAQ_ITEM_COUNT = 3;

/**
 * Reserve POST conflict codes that mean the query is no longer free.
 * `already_reserved` is another author's live reservation (in progress).
 * `occupied_by_published_product` is a published product on that query.
 */
export function audioSprintReserveConflictLifecycle(
  code: string,
): "in_progress" | "published" | null {
  if (code === "seo_query_occupied_by_published_product") return "published";
  if (code === "seo_query_already_reserved") return "in_progress";
  return null;
}

export function isAudioSprintAuthorGroup(
  value: string,
): value is AudioSprintAuthorGroup {
  return value === "music" || value === "voice";
}

export function audioSprintPublicationClass(
  authorGroup: AudioSprintAuthorGroup,
): "release" | "practice" {
  return authorGroup === "music" ? "release" : "practice";
}

/**
 * Valid sprint product pair.
 *
 * music author_group matches publication_class `release` or product_kind `music`.
 * voice author_group matches publication_class `practice`
 * (and not a music or audio-post kind).
 *
 * A mismatch is not a valid sprint product. Title lock is not applied.
 * Submit rejects with `audio_sprint_class_mismatch` so the query cannot be
 * sent to moderation under the wrong class and cannot skip the packaging gate.
 */
export function audioSprintProductMatchesGroup(input: {
  authorGroup: string | null | undefined;
  publicationClass: string | null | undefined;
  productKind: string | null | undefined;
}): boolean {
  const publicationClass = input.publicationClass?.trim() ?? "";
  const productKind = input.productKind?.trim() ?? "";
  if (input.authorGroup === "music") {
    return publicationClass === "release" || productKind === "music";
  }
  if (input.authorGroup === "voice") {
    if (publicationClass !== "practice") return false;
    if (productKind === "music" || productKind === "audio_post") return false;
    return true;
  }
  return false;
}

function filledText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/** Cover is present when a legacy URL or an image manifest variant path exists. */
export function audioSprintHasCover(input: {
  coverUrl: string | null | undefined;
  coverImage: unknown;
}): boolean {
  if (filledText(input.coverUrl)) return true;
  const image = input.coverImage;
  if (!image || typeof image !== "object") return false;
  const variants = (image as { variants?: unknown }).variants;
  if (!variants || typeof variants !== "object") return false;
  return Object.values(variants as Record<string, unknown>).some((variant) => {
    if (!variant || typeof variant !== "object") return false;
    const variantPath = (variant as { path?: unknown }).path;
    return typeof variantPath === "string" && variantPath.trim().length > 0;
  });
}

export function audioSprintEnabledPools(
  showReservePool: boolean = reservePoolEnabled,
): AudioSprintPool[] {
  return showReservePool ? ["initial", "reserve"] : ["initial"];
}

export function isAudioSprintPoolVisible(
  pool: string,
  showReservePool: boolean = reservePoolEnabled,
): pool is AudioSprintPool {
  return audioSprintEnabledPools(showReservePool).includes(pool as AudioSprintPool);
}

export function compareAudioSprintQueryText(left: string, right: string): number {
  return left.localeCompare(right, "ru", { sensitivity: "base" });
}

export function sortAudioSprintQueriesByCanonicalText<
  T extends { queryText: string },
>(items: readonly T[]): T[] {
  return [...items].sort((left, right) =>
    compareAudioSprintQueryText(left.queryText, right.queryText),
  );
}

export function selectVisibleAudioSprintQueries<
  T extends { pool: string; authorGroup: string; queryText: string },
>(
  items: readonly T[],
  showReservePool: boolean = reservePoolEnabled,
): T[] {
  return sortAudioSprintQueriesByCanonicalText(
    items.filter(
      (item) =>
        isAudioSprintPoolVisible(item.pool, showReservePool) &&
        isAudioSprintAuthorGroup(item.authorGroup),
    ),
  );
}

export function canReserveAudioSprintQuery(input: {
  lifecycle: SeoQueryLifecycle;
  isOwnReservation: boolean;
  activeReservationCount: number;
}): boolean {
  if (input.isOwnReservation) return false;
  if (input.lifecycle !== "available") return false;
  return !isSeoActiveReservationLimitReached(input.activeReservationCount);
}

export function buildAudioSprintProductCreateHref(input: {
  authorSlug: string;
  reservationId: string;
  authorGroup: AudioSprintAuthorGroup;
}): string {
  return buildAuthorProductCreateHref({
    authorSlug: input.authorSlug,
    reservationId: input.reservationId,
    publicationClass: audioSprintPublicationClass(input.authorGroup),
  });
}

export function audioSprintHref(authorSlug?: string | null): string {
  const params = new URLSearchParams();
  const slug = authorSlug?.trim() ?? "";
  if (slug) params.set("author", slug);
  const query = params.toString();
  const path = `/author-dashboard/audio-sprints/${AUDIO_SPRINT_OSEN_ZVUCHIT_SLUG}`;
  return query ? `${path}?${query}` : path;
}

export function evaluateAudioSprintTitleSave(input: {
  sprintQueryText: string | null;
  nextTitle: string;
}): { code: string; message: string } | null {
  const queryText = input.sprintQueryText?.trim() ?? "";
  if (!queryText) return null;
  if (input.nextTitle.trim() === queryText) return null;
  return {
    code: AUDIO_SPRINT_TITLE_LOCKED_CODE,
    message: AUDIO_SPRINT_TITLE_LOCKED_MESSAGE,
  };
}

export function evaluateAudioSprintModerationGate(input: {
  isSprintProduct: boolean;
  authorGroup: string | null;
  publicationClass: string | null;
  productKind: string | null;
  isFree: boolean;
  catalogVisibility: string | null;
  isCatalogListed: boolean;
  title: string;
  queryText: string;
  subtitle: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  usageItems: ReadonlyArray<{ content?: string | null }>;
  faqItems: ReadonlyArray<{ question?: string | null; answer?: string | null }>;
  coverUrl: string | null;
  coverImage: unknown;
}): { code: string; message: string } | null {
  if (!input.isSprintProduct) return null;

  if (
    !audioSprintProductMatchesGroup({
      authorGroup: input.authorGroup,
      publicationClass: input.publicationClass,
      productKind: input.productKind,
    })
  ) {
    return {
      code: AUDIO_SPRINT_CLASS_MISMATCH_CODE,
      message: AUDIO_SPRINT_CLASS_MISMATCH_MESSAGE,
    };
  }

  const queryText = input.queryText.trim();
  if (!queryText || input.title.trim() !== queryText) {
    return {
      code: AUDIO_SPRINT_TITLE_LOCKED_CODE,
      message: AUDIO_SPRINT_TITLE_LOCKED_MESSAGE,
    };
  }

  if (input.isFree !== true) {
    return {
      code: AUDIO_SPRINT_MUST_BE_FREE_CODE,
      message: AUDIO_SPRINT_MUST_BE_FREE_MESSAGE,
    };
  }

  if (input.catalogVisibility !== "listed" || input.isCatalogListed !== true) {
    return {
      code: AUDIO_SPRINT_MUST_BE_LISTED_CODE,
      message: AUDIO_SPRINT_MUST_BE_LISTED_MESSAGE,
    };
  }

  const usageCount = input.usageItems.filter((item) => filledText(item.content)).length;
  const faqCount = input.faqItems.filter(
    (item) => filledText(item.question) && filledText(item.answer),
  ).length;
  const packagingReady =
    Boolean(filledText(input.subtitle)) &&
    Boolean(filledText(input.description)) &&
    Boolean(filledText(input.seoTitle)) &&
    Boolean(filledText(input.seoDescription)) &&
    usageCount === AUDIO_SPRINT_USAGE_ITEM_COUNT &&
    faqCount === AUDIO_SPRINT_FAQ_ITEM_COUNT &&
    audioSprintHasCover({
      coverUrl: input.coverUrl,
      coverImage: input.coverImage,
    });

  if (!packagingReady) {
    return {
      code: AUDIO_SPRINT_SEO_REQUIRED_CODE,
      message: AUDIO_SPRINT_SEO_REQUIRED_MESSAGE,
    };
  }

  return null;
}
