import {
  isInvalidPromoPageCtaTarget,
  resolvePromoPageCtaTarget,
  type PromoPageCtaTarget,
} from "@/lib/promo-pages/cta-target";

export const PROMO_RECOMMENDATION_TITLE_MAX_LENGTH = 120;
export const PROMO_RECOMMENDATION_TEXT_MAX_LENGTH = 500;
export const PROMO_RECOMMENDATION_BUTTON_TEXT_MAX_LENGTH = 80;

export type PromoRecommendationFields = {
  promo_enabled: boolean;
  promo_title: string | null;
  promo_text: string | null;
  promo_button_text: string | null;
  promo_url: string | null;
  promo_open_in_new_tab: boolean;
};

export type PublicPromoRecommendation = {
  title: string;
  text: string;
  buttonText: string;
  target: PromoPageCtaTarget;
  openInNewTab: boolean;
};

export type PromoRecommendationValidationResult =
  | { ok: true; value: PromoRecommendationFields }
  | { ok: false; code: string; message: string };

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

export function validatePromoRecommendation(
  fields: Partial<PromoRecommendationFields>,
): PromoRecommendationValidationResult {
  const value: PromoRecommendationFields = {
    promo_enabled: fields.promo_enabled === true,
    promo_title: normalizeOptionalText(fields.promo_title),
    promo_text: normalizeOptionalText(fields.promo_text),
    promo_button_text: normalizeOptionalText(fields.promo_button_text),
    promo_url: normalizeOptionalText(fields.promo_url),
    promo_open_in_new_tab: fields.promo_open_in_new_tab === true,
  };

  if (!value.promo_enabled) {
    return { ok: true, value };
  }

  if (!value.promo_title) {
    return { ok: false, code: "promo_title_required", message: "Укажите заголовок рекомендации." };
  }
  if (value.promo_title.length > PROMO_RECOMMENDATION_TITLE_MAX_LENGTH) {
    return { ok: false, code: "promo_title_too_long", message: "Заголовок рекомендации не должен быть длиннее 120 символов." };
  }
  if (!value.promo_text) {
    return { ok: false, code: "promo_text_required", message: "Добавьте текст рекомендации." };
  }
  if (value.promo_text.length > PROMO_RECOMMENDATION_TEXT_MAX_LENGTH) {
    return { ok: false, code: "promo_text_too_long", message: "Текст рекомендации не должен быть длиннее 500 символов." };
  }
  if (!value.promo_button_text) {
    return { ok: false, code: "promo_button_text_required", message: "Укажите текст кнопки рекомендации." };
  }
  if (value.promo_button_text.length > PROMO_RECOMMENDATION_BUTTON_TEXT_MAX_LENGTH) {
    return { ok: false, code: "promo_button_text_too_long", message: "Текст кнопки не должен быть длиннее 80 символов." };
  }
  if (!value.promo_url) {
    return { ok: false, code: "promo_url_required", message: "Укажите ссылку рекомендации." };
  }
  if (isInvalidPromoPageCtaTarget(value.promo_url)) {
    return { ok: false, code: "promo_url_invalid", message: "Укажите корректную безопасную ссылку." };
  }

  return { ok: true, value };
}

export function resolvePublicPromoRecommendation(
  fields: Partial<PromoRecommendationFields>,
): PublicPromoRecommendation | null {
  const validation = validatePromoRecommendation(fields);

  if (!validation.ok || !validation.value.promo_enabled) {
    return null;
  }

  const target = resolvePromoPageCtaTarget(validation.value.promo_url);

  if (
    !validation.value.promo_title ||
    !validation.value.promo_text ||
    !validation.value.promo_button_text ||
    !target ||
    target === "invalid"
  ) {
    return null;
  }

  return {
    title: validation.value.promo_title,
    text: validation.value.promo_text,
    buttonText: validation.value.promo_button_text,
    target,
    openInNewTab: validation.value.promo_open_in_new_tab,
  };
}
