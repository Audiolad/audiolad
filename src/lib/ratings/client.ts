import { readAnonymousId } from "@/lib/analytics/identity-storage";
import type {
  PracticeRatingOwnState,
  PracticeRatingPutState,
} from "@/lib/ratings/types";

export const RATING_NOT_ELIGIBLE_COPY =
  "Послушайте аудио хотя бы 30 секунд, чтобы поставить оценку.";

export const RATING_THANKS_COPY = "Спасибо за ваш отклик 🙏";

export const RATING_AUTHOR_DENIED_COPY = "Нельзя оценить свой продукт.";

export function buildPracticeRatingApiPath(
  authorSlug: string,
  productSlug: string,
): string {
  return `/api/listen/product/${encodeURIComponent(authorSlug)}/${encodeURIComponent(productSlug)}/rating`;
}

export function buildPracticeRatingPutBody(stars: number): Record<string, unknown> {
  const body: Record<string, unknown> = { stars };
  const anonymousId = readAnonymousId();
  if (anonymousId) {
    body.audiolad_anonymous_id = anonymousId;
  }
  return body;
}

export async function fetchOwnPracticeRating(
  apiPath: string,
): Promise<PracticeRatingOwnState> {
  const response = await fetch(apiPath, {
    method: "GET",
    credentials: "same-origin",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw Object.assign(new Error(payload?.error ?? "rating_get_failed"), {
      status: response.status,
      error: payload?.error ?? "rating_get_failed",
    });
  }

  return (await response.json()) as PracticeRatingOwnState;
}

export async function putOwnPracticeRating(
  apiPath: string,
  stars: number,
): Promise<PracticeRatingPutState> {
  const response = await fetch(apiPath, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(buildPracticeRatingPutBody(stars)),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw Object.assign(new Error(payload?.error ?? "rating_put_failed"), {
      status: response.status,
      error: payload?.error ?? "rating_put_failed",
    });
  }

  return (await response.json()) as PracticeRatingPutState;
}
