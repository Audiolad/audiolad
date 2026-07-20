export function mapPromoPageRpcErrorMessage(message: string): {
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

  if (normalized.includes("promo_page_not_found") || normalized.includes("practice_not_found")) {
    return { error: "not_found", status: 404 };
  }

  if (normalized.includes("promo_page_edit_locked") || normalized.includes("promo_page_status_change_requires_rpc")) {
    return { error: "promo_page_edit_locked", status: 409 };
  }

  if (normalized.includes("promo_page_publish_not_allowed")) {
    return { error: "promo_page_publish_not_allowed", status: 409 };
  }

  if (normalized.includes("promo_page_unpublish_not_allowed")) {
    return { error: "promo_page_unpublish_not_allowed", status: 409 };
  }

  if (normalized.includes("promo_page_product_count_invalid")) {
    return { error: "promo_page_product_count_invalid", status: 400 };
  }

  if (normalized.includes("promo_page_product_not_eligible")) {
    return { error: "promo_page_product_not_eligible", status: 400 };
  }

  if (normalized.includes("promo_page_products_limit_exceeded")) {
    return { error: "promo_page_products_limit_exceeded", status: 400 };
  }

  if (normalized.includes("promo_page_product_duplicate")) {
    return { error: "promo_page_product_duplicate", status: 400 };
  }

  if (normalized.includes("promo_page_product_owner_mismatch")) {
    return { error: "promo_page_product_forbidden", status: 403 };
  }

  if (normalized.includes("promo_page_slug_invalid")) {
    return { error: "promo_page_slug_invalid", status: 400 };
  }

  if (normalized.includes("promo_page_slug_taken")) {
    return { error: "promo_page_slug_taken", status: 409 };
  }

  if (normalized.includes("promo_page_internal_name_required")) {
    return { error: "promo_page_internal_name_required", status: 400 };
  }

  if (
    normalized.includes("promo_page_author_id_immutable") ||
    normalized.includes("promo_page_created_by_immutable") ||
    normalized.includes("promo_page_published_at_immutable")
  ) {
    return { error: "invalid_request", status: 400 };
  }

  if (normalized.includes("promo_page_product_id_required")) {
    return { error: "promo_page_product_duplicate", status: 400 };
  }

  if (normalized.includes("promo_page_cta_href_invalid")) {
    return { error: "promo_page_cta_href_invalid", status: 400 };
  }

  if (normalized.includes("promo_page_public_title_required")) {
    return { error: "promo_page_public_title_required", status: 400 };
  }

  return { error: "internal_error", status: 500 };
}

export const PROMO_PAGE_UI_ERROR_MESSAGES: Record<string, string> = {
  promo_page_edit_locked:
    "Опубликованную страницу нельзя редактировать. Сначала снимите её с публикации.",
  promo_page_product_count_invalid:
    "Для публикации нужно выбрать от 1 до 3 доступных продуктов.",
  promo_page_product_not_eligible:
    "Один или несколько продуктов недоступны для промостраницы.",
  promo_page_products_limit_exceeded: "Можно выбрать не больше 3 продуктов.",
  promo_page_product_duplicate: "Каждый продукт можно выбрать только один раз.",
  promo_page_product_forbidden: "Можно добавлять только продукты вашего пространства.",
  promo_page_slug_taken: "Этот адрес уже занят. Измените slug.",
  promo_page_slug_invalid: "Проверьте адрес страницы.",
  promo_page_cta_href_invalid: "Укажите безопасную внутреннюю ссылку для CTA.",
  promo_page_public_title_required: "Укажите публичный заголовок.",
  promo_page_internal_name_required: "Укажите внутреннее название.",
  promo_page_publish_not_allowed: "Сейчас эту страницу нельзя опубликовать.",
  save_failed: "Не удалось сохранить промостраницу.",
  load_failed: "Не удалось загрузить промостраницу.",
};

export function getPromoPageUiErrorMessage(code: string | undefined): string {
  if (!code) {
    return PROMO_PAGE_UI_ERROR_MESSAGES.save_failed;
  }

  return PROMO_PAGE_UI_ERROR_MESSAGES[code] ?? PROMO_PAGE_UI_ERROR_MESSAGES.save_failed;
}
