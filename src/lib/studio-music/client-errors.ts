export const STUDIO_MUSIC_GENERIC_ERROR =
  "Не удалось начать оплату. Попробуйте ещё раз.";

export const STUDIO_MUSIC_NETWORK_ERROR =
  "Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.";

export const STUDIO_MUSIC_ACQUIRE_GENERIC_ERROR =
  "Не удалось получить музыку. Попробуйте ещё раз.";

export function mapStudioMusicCheckoutClientError(code: string | undefined): string {
  switch (code) {
    case "unauthorized":
      return "Войдите, чтобы купить музыку для Студии.";
    case "already_studio_entitled":
      return "Эта музыка уже доступна в Студии.";
    case "pending_order_exists":
      return "Есть незавершённый платёж. Дождитесь завершения или повторите позже.";
    case "price_changed":
      return "Цена изменилась. Обновите каталог и попробуйте ещё раз.";
    case "author_finance_not_ready":
      return "Оплата временно недоступна. Попробуйте позже.";
    case "payments_not_configured":
      return "Оплата сейчас недоступна.";
    case "practice_not_found":
      return "Музыка не найдена или временно недоступна.";
    case "practice_not_for_sale":
      return "Эту музыку сейчас нельзя купить для Студии.";
    case "order_already_paid":
      return "Этот платёж уже завершён. Обновите каталог.";
    case "order_not_payable":
      return "Этот платёж больше нельзя продолжить. Обновите каталог и попробуйте снова.";
    case "invalid_request":
      return "Не удалось начать оплату. Обновите каталог и попробуйте ещё раз.";
    case "provider_checkout_failed":
      return "Платёжная система не создала ссылку. Попробуйте ещё раз через минуту.";
    case "internal_error":
      return STUDIO_MUSIC_GENERIC_ERROR;
    default:
      return STUDIO_MUSIC_GENERIC_ERROR;
  }
}

export function mapStudioMusicAcquireClientError(code: string | undefined): string {
  switch (code) {
    case "unauthorized":
      return "Войдите, чтобы получить музыку для Студии.";
    case "practice_not_free":
      return "Эта музыка не бесплатная.";
    case "practice_not_found":
      return "Музыка не найдена или временно недоступна.";
    case "invalid_request":
      return "Не удалось получить музыку. Обновите каталог и попробуйте ещё раз.";
    default:
      return STUDIO_MUSIC_ACQUIRE_GENERIC_ERROR;
  }
}

export function resolveStudioMusicCheckoutUiError(input: {
  httpStatus: number;
  errorCode?: string;
  paymentUrl?: string | null;
  networkFailed?: boolean;
}): string {
  if (input.networkFailed) {
    return STUDIO_MUSIC_NETWORK_ERROR;
  }

  if (input.httpStatus === 401) {
    return mapStudioMusicCheckoutClientError("unauthorized");
  }

  const paymentUrl = input.paymentUrl?.trim() ?? "";

  if (input.httpStatus >= 200 && input.httpStatus < 300 && !paymentUrl) {
    return mapStudioMusicCheckoutClientError(
      input.errorCode ?? "provider_checkout_failed",
    );
  }

  if (input.httpStatus < 200 || input.httpStatus >= 300 || !paymentUrl) {
    return mapStudioMusicCheckoutClientError(input.errorCode);
  }

  return "";
}
