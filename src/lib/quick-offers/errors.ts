export function mapQuickOfferRpcErrorMessage(message: string): {
  error: string;
  status: number;
} {
  const normalized = message.trim().toLowerCase();

  if (normalized.includes("not_authenticated")) {
    return { error: "unauthorized", status: 401 };
  }

  if (normalized.includes("forbidden")) {
    return { error: "forbidden", status: 403 };
  }

  if (
    normalized.includes("quick_offer_not_found") ||
    normalized.includes("practice_not_found")
  ) {
    return { error: "not_found", status: 404 };
  }

  if (normalized.includes("quick_offer_slug_taken")) {
    return { error: "quick_offer_slug_taken", status: 409 };
  }

  if (normalized.includes("quick_offer_publish_not_allowed")) {
    return { error: "quick_offer_publish_not_allowed", status: 409 };
  }

  if (normalized.includes("quick_offer_unpublish_not_allowed")) {
    return { error: "quick_offer_unpublish_not_allowed", status: 409 };
  }

  if (normalized.includes("quick_offer_product_not_eligible")) {
    return { error: "quick_offer_product_not_eligible", status: 400 };
  }

  if (normalized.includes("quick_offer_product_owner_mismatch")) {
    return { error: "quick_offer_product_forbidden", status: 403 };
  }

  if (normalized.includes("quick_offer_materials_required")) {
    return { error: "quick_offer_materials_required", status: 400 };
  }

  if (normalized.includes("quick_offer_hero_required")) {
    return { error: "quick_offer_hero_required", status: 400 };
  }

  if (normalized.includes("quick_offer_format")) {
    return { error: "quick_offer_format_invalid", status: 400 };
  }

  if (normalized.includes("quick_offer_invalid")) {
    return { error: "quick_offer_invalid", status: 400 };
  }

  if (normalized.includes("quick_offer_slug")) {
    return { error: "quick_offer_slug_invalid", status: 400 };
  }

  return { error: "internal_error", status: 500 };
}

export const QUICK_OFFER_UI_ERROR_MESSAGES: Record<string, string> = {
  quick_offer_slug_taken: "Этот адрес уже занят. Измените slug.",
  quick_offer_slug_invalid: "Проверьте адрес страницы.",
  quick_offer_slug_required: "Укажите адрес страницы.",
  quick_offer_slug_too_short: "Адрес должен быть не короче 2 символов.",
  quick_offer_title_required: "Укажите заголовок.",
  quick_offer_title_too_long: "Заголовок слишком длинный.",
  quick_offer_description_required: "Укажите короткое описание.",
  quick_offer_description_too_long: "Описание слишком длинное.",
  quick_offer_cta_required: "Укажите текст кнопки.",
  quick_offer_cta_too_long: "Текст кнопки слишком длинный.",
  quick_offer_promo_price_invalid: "Укажите промо-цену целым числом в рублях.",
  quick_offer_promo_price_too_high: "Промо-цена слишком большая.",
  quick_offer_timer_invalid: "Выберите длительность таймера.",
  quick_offer_format_required: "Укажите формат карточки.",
  quick_offer_format_too_long: "Формат — не больше 6 символов в одну строку.",
  quick_offer_format_newline: "Формат должен быть в одну строку.",
  quick_offer_format_invalid: "Проверьте подпись формата.",
  quick_offer_materials_required: "Добавьте хотя бы одну карточку материала.",
  quick_offer_materials_too_many: "Слишком много карточек.",
  quick_offer_hero_required: "Загрузите обложку оффера.",
  quick_offer_product_not_eligible:
    "Можно привязать только свой опубликованный платный продукт.",
  quick_offer_product_forbidden: "Нельзя привязать чужой продукт.",
  quick_offer_publish_not_allowed: "Сейчас этот оффер нельзя опубликовать.",
  quick_offer_unpublish_not_allowed: "Оффер уже снят с публикации.",
  quick_offer_template_unsupported: "Этот шаблон пока недоступен.",
  save_failed: "Не удалось сохранить оффер.",
  load_failed: "Не удалось загрузить оффер.",
};

export function getQuickOfferUiErrorMessage(code: string | undefined): string {
  if (!code) {
    return QUICK_OFFER_UI_ERROR_MESSAGES.save_failed;
  }

  return (
    QUICK_OFFER_UI_ERROR_MESSAGES[code] ?? QUICK_OFFER_UI_ERROR_MESSAGES.save_failed
  );
}
