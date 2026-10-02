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
  "Заполните заголовок для поиска, описание для поиска и текст «Подробнее о продукте».";

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
  isFree: boolean;
  catalogVisibility: string | null;
  title: string;
  queryText: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoAbout: string | null;
}): { code: string; message: string } | null {
  if (!input.isSprintProduct) return null;

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

  if (input.catalogVisibility !== "listed") {
    return {
      code: AUDIO_SPRINT_MUST_BE_LISTED_CODE,
      message: AUDIO_SPRINT_MUST_BE_LISTED_MESSAGE,
    };
  }

  if (
    !input.seoTitle?.trim() ||
    !input.seoDescription?.trim() ||
    !input.seoAbout?.trim()
  ) {
    return {
      code: AUDIO_SPRINT_SEO_REQUIRED_CODE,
      message: AUDIO_SPRINT_SEO_REQUIRED_MESSAGE,
    };
  }

  return null;
}
