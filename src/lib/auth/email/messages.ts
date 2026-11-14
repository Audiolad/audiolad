import type { EmailValidationErrorCode } from "./types";

export const SIGNUP_EMAIL_LABEL = "Email";

export const EMAIL_FIELD_HINT =
  "Рекомендуем использовать Яндекс Почту (например, sergey@yandex.ru) - так письма и коды от АудиоЛада приходят стабильнее. Можно использовать и другой поддерживаемый почтовый сервис.";

/** t1446u: a new email in the cafe / Business cabinet (receipt, login linking). */
export const NEW_EMAIL_FIELD_HINT =
  "Подойдёт российская почта: Яндекс, Mail.ru, Рамблер. Рекомендуем Яндекс Почту – так письма и коды приходят стабильнее.";

export const NEW_EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE =
  "Gmail и другие зарубежные почтовые сервисы указать нельзя. Подойдёт российская почта – рекомендуем Яндекс Почту.";

export const SIGNUP_PASSWORD_LABEL = "Придумайте пароль";

export const PASSWORD_MIN_LENGTH = 8;

export const SIGNUP_PASSWORD_HINT = `Минимум ${PASSWORD_MIN_LENGTH} символов.`;

export const EMAIL_VALIDATION_MESSAGES: Record<EmailValidationErrorCode, string> =
  {
    empty: "Укажите адрес электронной почты.",
    invalid_format:
      "Проверьте адрес электронной почты. Например: name@yandex.ru",
    domain_not_allowed:
      "Этот почтовый сервис пока нельзя использовать для регистрации. Рекомендуем Яндекс Почту.",
    local_part_empty:
      "Проверьте адрес электронной почты. Например: name@yandex.ru",
    domain_empty:
      "Проверьте адрес электронной почты. Например: name@yandex.ru",
    too_long: "Адрес электронной почты слишком длинный.",
    local_part_too_long: "Адрес электронной почты слишком длинный.",
  };

export function getEmailValidationMessage(code: EmailValidationErrorCode): string {
  return EMAIL_VALIDATION_MESSAGES[code];
}

export const PASSWORD_TOO_SHORT_MESSAGE = `Пароль должен содержать не менее ${PASSWORD_MIN_LENGTH} символов.`;

export const SIGNUP_GENERIC_ERROR =
  "Не удалось создать аккаунт. Проверьте данные и попробуйте ещё раз.";

export const SIGNUP_EXISTING_ACCOUNT_MESSAGE =
  "Если этот адрес уже зарегистрирован, войдите в аккаунт или восстановите пароль.";

export const LEGAL_CONSENT_REQUIRED_MESSAGE =
  "Чтобы создать аккаунт, примите Пользовательское соглашение и Политику обработки персональных данных.";

export const LISTENER_MARKETING_CONSENT_TEXT_VERSION =
  "listener_marketing_signup_v1_2026-07-17";

export const LISTENER_MARKETING_CONSENT_SOURCE = "signup_checkbox";
