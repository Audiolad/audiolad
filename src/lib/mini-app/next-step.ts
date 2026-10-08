import { isAudioPostProductKind } from "@/lib/author-products/product-kind";
import {
  PROMO_RECOMMENDATION_BUTTON_TEXT_MAX_LENGTH,
  PROMO_RECOMMENDATION_TEXT_MAX_LENGTH,
  PROMO_RECOMMENDATION_TITLE_MAX_LENGTH,
  resolvePublicPromoRecommendation,
  type PromoRecommendationFields,
  type PublicPromoRecommendation,
} from "@/lib/products/promo-recommendation";
import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

/**
 * Author-saved «Следующий шаг» for mini-apps (MAX, VK).
 *
 * Same source and rules as the canonical web audio_post card:
 * only audio_post, only promo_enabled with a complete, validated title/text/
 * button/link (resolvePublicPromoRecommendation). The link is handed to the
 * client as an absolute https URL so the MAX/VK bridge can open it; internal
 * site paths resolve against the production origin.
 */
export type MiniAppNextStep = {
  title: string;
  text: string;
  buttonText: string;
  url: string;
};

const MINI_APP_NEXT_STEP_KEYS = ["buttonText", "text", "title", "url"] as const;
const MINI_APP_NEXT_STEP_URL_MAX_LENGTH = 2048;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

/** Absolute https URL without credentials; null for anything else. */
export function normalizeMiniAppNextStepUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MINI_APP_NEXT_STEP_URL_MAX_LENGTH) return null;
  if (hasControlCharacters(trimmed)) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (!parsed.hostname) return null;
  return parsed.toString();
}

export function toMiniAppNextStep(
  recommendation: PublicPromoRecommendation | null,
): MiniAppNextStep | null {
  if (!recommendation) return null;
  let url: string | null = null;
  if (recommendation.target.kind === "internal") {
    let resolved: URL;
    try {
      resolved = new URL(recommendation.target.href, `${PRODUCTION_APP_ORIGIN}/`);
    } catch {
      return null;
    }
    if (resolved.origin !== PRODUCTION_APP_ORIGIN) return null;
    url = normalizeMiniAppNextStepUrl(resolved.toString());
  } else {
    url = normalizeMiniAppNextStepUrl(recommendation.target.href);
  }
  if (!url) return null;
  return {
    title: recommendation.title,
    text: recommendation.text,
    buttonText: recommendation.buttonText,
    url,
  };
}

export function resolveMiniAppNextStep(input: {
  productKind: string | null | undefined;
  promo: Partial<{
    [K in keyof PromoRecommendationFields]: PromoRecommendationFields[K] | null;
  }>;
}): MiniAppNextStep | null {
  if (!isAudioPostProductKind(input.productKind)) return null;
  return toMiniAppNextStep(
    resolvePublicPromoRecommendation({
      promo_enabled: input.promo.promo_enabled === true,
      promo_title: input.promo.promo_title ?? null,
      promo_text: input.promo.promo_text ?? null,
      promo_button_text: input.promo.promo_button_text ?? null,
      promo_url: input.promo.promo_url ?? null,
      promo_open_in_new_tab: input.promo.promo_open_in_new_tab === true,
    }),
  );
}

function readBoundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

/**
 * Client-side parser. Missing / null → no block. A malformed value never
 * breaks the product card: the block is dropped instead.
 */
export function readMiniAppNextStep(value: unknown): MiniAppNextStep | null {
  if (!isRecord(value)) return null;
  if (
    Object.keys(value).some(
      (key) => !(MINI_APP_NEXT_STEP_KEYS as readonly string[]).includes(key),
    )
  ) {
    return null;
  }
  const title = readBoundedText(value.title, PROMO_RECOMMENDATION_TITLE_MAX_LENGTH);
  const text = readBoundedText(value.text, PROMO_RECOMMENDATION_TEXT_MAX_LENGTH);
  const buttonText = readBoundedText(
    value.buttonText,
    PROMO_RECOMMENDATION_BUTTON_TEXT_MAX_LENGTH,
  );
  const url = normalizeMiniAppNextStepUrl(value.url);
  if (!title || !text || !buttonText || !url) return null;
  return { title, text, buttonText, url };
}
