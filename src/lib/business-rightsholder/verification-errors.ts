/**
 * 8d9cd0af (Sergey 18.10.2026 19:37): the rights-check form must never show a raw database code.
 * Maps the codes raised by draft_* / evidence_reserve / submit_* to plain Russian. A message that
 * sends the author to another page always carries a direct link (standing UX rule). En dashes only.
 * Pure and browser-safe.
 */
import { SUPPORT_MODE_CONSENT_NOTICE } from "@/lib/author-support/consent-guard";

export type VerificationFormError = {
  text: string;
  link?: { href: string; label: string };
  /** The case is pending or closed: the form offers «Обновить страницу» to show its real status. */
  refresh?: boolean;
};

export const LEGAL_DOCUMENTS_HREF = "/author-dashboard/legal";
export const SIGN_IN_HREF = "/auth/sign-in?next=%2Fauthor-dashboard%2Fbusiness";

export const VERIFICATION_ERROR_FALLBACK =
  "Не получилось отправить заявку. Проверьте данные и попробуйте ещё раз.";

const TRACK = "Выбранный трек не опубликован или не входит в этот продукт – выберите другой трек.";
const PRODUCT = "Можно выбрать только свой опубликованный музыкальный продукт – выберите другой.";
const FIELDS = "Проверьте поля о сервисе, где сделана музыка, – часть данных заполнена неверно.";
const PENDING_OR_CLOSED =
  "Заявку сейчас нельзя изменить: она уже на проверке или закрыта модератором.";

const BY_CODE: Record<string, VerificationFormError> = {
  business_verification_already_active: {
    text: "Заявка уже отправлена – дождитесь решения модератора.",
    refresh: true,
  },
  business_verification_submit_forbidden: { text: PENDING_OR_CLOSED, refresh: true },
  business_evidence_upload_forbidden: { text: PENDING_OR_CLOSED, refresh: true },
  business_track_not_in_product: { text: TRACK },
  business_track_not_published: { text: TRACK },
  business_track_not_found: { text: TRACK },
  business_product_not_owned: { text: PRODUCT },
  business_product_not_found: { text: PRODUCT },
  business_product_not_published: { text: PRODUCT },
  business_service_link_invalid: {
    text: "Проверьте ссылку на трек: для Suno нужна ссылка вида https://suno.com/s/… или https://suno.com/song/….",
  },
  business_ai_service_invalid: { text: "Выберите, где сделана музыка; для варианта «Другое» коротко опишите способ." },
  business_provider_details_invalid: { text: FIELDS },
  business_musicgpt_plan_required: { text: "Укажите тариф MusicGPT, на котором создан трек." },
  business_suno_generation_refs_required: { text: FIELDS },
  business_service_track_title_invalid: { text: "Укажите название трека в сервисе (до 500 символов)." },
  business_evidence_files_required: { text: "Приложите все нужные файлы-подтверждения и отправьте снова." },
  business_two_evidence_files_required: { text: "Приложите оба файла-подтверждения и отправьте снова." },
  business_unified_agreement_inactive: {
    text: "Проверка прав для «АудиоЛад Бизнес» пока недоступна – попробуйте позже.",
  },
  business_unified_agreement_required: {
    text: "Сначала примите Единое коммерческое соглашение в разделе «Юридические документы».",
    link: { href: LEGAL_DOCUMENTS_HREF, label: "Перейти и принять" },
  },
  support_mode_consent_forbidden: { text: SUPPORT_MODE_CONSENT_NOTICE },
  authentication_required: {
    text: "Сессия истекла – войдите снова и повторите отправку.",
    link: { href: SIGN_IN_HREF, label: "Войти" },
  },
};

/** Codes are matched as whole tokens inside the error message (PostgREST wraps them). */
export function verificationFormError(message: string | null | undefined): VerificationFormError {
  const text = String(message ?? "");
  for (const code of Object.keys(BY_CODE)) {
    if (new RegExp(`(^|[^a-z_])${code}([^a-z_]|$)`).test(text)) return BY_CODE[code];
  }
  return { text: VERIFICATION_ERROR_FALLBACK };
}

export const VERIFICATION_ERROR_CODES = Object.keys(BY_CODE);
