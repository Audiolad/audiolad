export type CourseUpgradeClientErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "invalid_target_access_level"
  | "practice_not_found"
  | "not_course"
  | "practice_not_for_sale"
  | "not_entitled"
  | "upgrade_not_configured"
  | "already_at_target"
  | "pending_order_exists"
  | "author_finance_not_ready"
  | "payments_not_configured"
  | "order_already_paid"
  | "order_not_payable"
  | "provider_checkout_failed"
  | "internal_error";

export const COURSE_UPGRADE_GENERIC_ERROR =
  "Не удалось начать оплату. Попробуйте ещё раз.";

/**
 * Stable listener-facing copy for known checkout states.
 * Does not include provider tokens, raw Tochka payloads, or internal stages.
 */
export function mapCourseUpgradeClientError(
  code: string | undefined,
): string {
  switch (code) {
    case "unauthorized":
      return "Войдите, чтобы открыть следующий уровень.";
    case "not_entitled":
      return "Сначала нужен доступ к текущему уровню.";
    case "upgrade_not_configured":
    case "invalid_target_access_level":
      return "Следующий уровень сейчас недоступен.";
    case "already_at_target":
      return "Этот уровень уже открыт.";
    case "pending_order_exists":
      return "Есть незавершённый платёж. Дождитесь завершения или повторите позже.";
    case "author_finance_not_ready":
      return "Оплата временно недоступна. Попробуйте позже.";
    case "payments_not_configured":
      return "Оплата сейчас недоступна.";
    case "practice_not_found":
      return "Курс не найден или временно недоступен.";
    case "practice_not_for_sale":
    case "not_course":
      return "Этот уровень сейчас нельзя оплатить.";
    case "order_already_paid":
      return "Этот платёж уже завершён. Обновите страницу.";
    case "order_not_payable":
      return "Этот платёж больше нельзя продолжить. Обновите страницу и попробуйте снова.";
    case "invalid_request":
      return "Не удалось начать оплату. Обновите страницу и попробуйте ещё раз.";
    case "provider_checkout_failed":
      return "Платёжная система не создала ссылку. Попробуйте ещё раз через минуту.";
    default:
      return COURSE_UPGRADE_GENERIC_ERROR;
  }
}
