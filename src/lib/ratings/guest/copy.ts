export const GUEST_RATING_NOT_ELIGIBLE_COPY =
  "Послушайте доступный фрагмент, чтобы оставить свой отклик.";

export const GUEST_RATING_CAPTCHA_UNAVAILABLE_COPY =
  "Не удалось проверить, попробуйте позже.";

export const GUEST_RATING_CAPTCHA_INVALID_COPY =
  "Проверка не прошла. Попробуйте ещё раз.";

export const GUEST_RATING_SAVE_FAILED_COPY =
  "Не удалось сохранить оценку. Попробуйте ещё раз.";

export const GUEST_RATING_SESSION_COPY =
  "Гостевая сессия не сохранилась. Разрешите cookie и послушайте фрагмент ещё раз.";

export const GUEST_RATING_CAPTCHA_NOTICE =
  "Проверка защищает оценки от автоматических голосов. Данные обрабатывает сервис проверки.";

export const GUEST_RATING_AGGREGATE_LABEL = "Оценки гостей";

export const GUEST_RATING_ADMIN_LIST_LABEL = "Гости";

export const GUEST_RATING_ADMIN_REGISTERED_LABEL = "Зарегистрированные";

export const GUEST_RATING_ADMIN_NO_PII =
  "ФИО и почта не хранятся. Показан только анонимный ID сессии.";

export const GUEST_RATING_ADMIN_NO_IP_SANCTION =
  "Это наблюдения, а не санкция. Общий IP не блокируется.";

export function formatGuestSessionAdminLabel(guestId: string): string {
  return `Гость · ID сессии ${guestId}`;
}

export function guestRatingMessageForError(error: string | undefined): string {
  if (error === "rating_not_eligible") {
    return GUEST_RATING_NOT_ELIGIBLE_COPY;
  }
  if (error === "captcha_unavailable" || error === "guest_session_unavailable") {
    return GUEST_RATING_CAPTCHA_UNAVAILABLE_COPY;
  }
  if (error === "captcha_invalid") {
    return GUEST_RATING_CAPTCHA_INVALID_COPY;
  }
  if (error === "guest_session_required") {
    return GUEST_RATING_SESSION_COPY;
  }
  return GUEST_RATING_SAVE_FAILED_COPY;
}
