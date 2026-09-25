import type { SeoQueryOpportunity } from "@/lib/seo-queries/types";
import { countActiveAuthorSeoReservations } from "@/lib/seo-queries/types";

/** Same route AuthorSeoOpportunitiesClient already uses. No new RPC. */
export const AUTHOR_SEO_RESERVATIONS_PATH = "/api/author/seo-reservations";

export const RELEASE_SEO_QUERY_FALLBACK_MESSAGE = "Не удалось освободить запрос.";

export type ReleaseSeoReservationBody = {
  author_id: string;
  reservation_id: string;
  publication_class: string;
};

export function buildReleaseSeoReservationBody(input: {
  authorId: string;
  reservationId: string;
  publicationClass: string;
}): ReleaseSeoReservationBody {
  return {
    author_id: input.authorId,
    reservation_id: input.reservationId,
    publication_class: input.publicationClass,
  };
}

export function releaseSeoQueryConfirmCopy(queryText: string): {
  title: string;
  description: string;
} {
  return {
    title: `Освободить запрос „${queryText}“?`,
    description: "Он снова станет доступен другим авторам.",
  };
}

export function releaseSeoReservationErrorMessage(payload: {
  message?: unknown;
}): string {
  return typeof payload.message === "string" && payload.message.trim()
    ? payload.message
    : RELEASE_SEO_QUERY_FALLBACK_MESSAGE;
}

/**
 * Own reservation that is still in the pre-create «Ваши запросы в работе» block.
 * Published/used and product-linked rows stay out of that block.
 */
export function isOwnUnlinkedSeoOpportunity(
  item: Pick<SeoQueryOpportunity, "reservationId" | "lifecycle" | "productId">,
): boolean {
  return Boolean(item.reservationId) && item.lifecycle !== "published" && !item.productId;
}

export function selectOwnUnlinkedSeoOpportunities<
  T extends Pick<SeoQueryOpportunity, "reservationId" | "lifecycle" | "productId">,
>(opportunities: readonly T[]): T[] {
  return opportunities.filter((item) => isOwnUnlinkedSeoOpportunity(item));
}

/**
 * Successful release only. Mirrors AuthorSeoOpportunitiesClient: the row
 * becomes available, so it leaves the unlinked block and drops out of the
 * active reservation count. Failed DELETE must not call this.
 */
export function opportunitiesAfterOwnReservationRelease<T extends SeoQueryOpportunity>(
  opportunities: readonly T[],
  releasedReservationIds: readonly string[],
): readonly T[] {
  if (releasedReservationIds.length === 0) return opportunities;
  const released = new Set(releasedReservationIds);
  return opportunities.map((item) =>
    item.reservationId && released.has(item.reservationId)
      ? {
          ...item,
          reservationId: null,
          expiresAt: null,
          productId: null,
          productTitle: null,
          lifecycle: "available",
        }
      : item,
  );
}

/** Derived active count after a release attempt. Failed DELETE keeps the count. */
export function activeReservationCountAfterRelease(
  opportunities: readonly Pick<SeoQueryOpportunity, "reservationId" | "lifecycle">[],
  releasedReservationIds: readonly string[],
  releaseSucceeded: boolean,
): number {
  if (!releaseSucceeded || releasedReservationIds.length === 0) {
    return countActiveAuthorSeoReservations(opportunities);
  }
  const released = new Set(releasedReservationIds);
  return countActiveAuthorSeoReservations(
    opportunities.map((item) =>
      item.reservationId && released.has(item.reservationId)
        ? { reservationId: null, lifecycle: "available" as const }
        : item,
    ),
  );
}

type ReleaseFetch = (
  input: string,
  init: { method: string; headers: { "content-type": string }; body: string },
) => Promise<Response>;

export async function requestReleaseSeoReservation(input: {
  authorId: string;
  reservationId: string;
  publicationClass: string;
  fetchImpl?: ReleaseFetch;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(AUTHOR_SEO_RESERVATIONS_PATH, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildReleaseSeoReservationBody({
          authorId: input.authorId,
          reservationId: input.reservationId,
          publicationClass: input.publicationClass,
        }),
      ),
    });
    let payload: { message?: unknown } = {};
    try {
      const raw = await response.json();
      if (raw && typeof raw === "object") {
        payload = raw as { message?: unknown };
      }
    } catch {
      payload = {};
    }
    if (!response.ok) {
      return { ok: false, message: releaseSeoReservationErrorMessage(payload) };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: RELEASE_SEO_QUERY_FALLBACK_MESSAGE };
  }
}
