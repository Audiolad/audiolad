/** Account-level answer to «Планируете дальше пользоваться сервисом?». */

import {
  BUSINESS_ACCESS_REMINDER_LEAD_DAYS,
  moscowCalendarDaysBetween,
} from "@/lib/business/access-reminders";

export const BUSINESS_RENEWAL_QUESTION = "Планируете дальше пользоваться сервисом?";

export const BUSINESS_RENEWAL_YES_LABEL = "Да";

export const BUSINESS_RENEWAL_NO_LABEL = "Нет";

export const BUSINESS_RENEWAL_CONFIRM_TEXT = "Сохранить ответ?";

export const BUSINESS_RENEWAL_CONFIRM_YES = "Да";

export const BUSINESS_RENEWAL_CONFIRM_CANCEL = "Отмена";

export const BUSINESS_RENEWAL_THANKS_OWNER =
  "Спасибо за ответ. Писем о продлении за этот срок больше не будет.";

export const BUSINESS_RENEWAL_THANKS_DEVICE = "Спасибо за ответ.";

export const BUSINESS_RENEWAL_THANKS_YES = "Спасибо за ответ.";

export const BUSINESS_RENEWAL_CHANGE_LABEL = "Изменить ответ";

export const BUSINESS_RENEWAL_NOTE_SENT = "Спасибо, мы прочитаем.";

export const BUSINESS_RENEWAL_IMPROVEMENT_QUESTION =
  "Что нам улучшить, чтобы вам понравилось и вы вернулись?";

export const BUSINESS_RENEWAL_IMPROVEMENT_SEND = "Отправить";

export const BUSINESS_RENEWAL_YES_URL = "https://business.audiolad.ru/#prodlenie?otvet=da";

export const BUSINESS_RENEWAL_NO_URL = "https://business.audiolad.ru/#prodlenie?otvet=net";

export const BUSINESS_RENEWAL_NOTE_MAX = 400;

export type BusinessRenewalAnswer = "yes" | "no";

/** A stored «Нет» for this contractual end stops the remaining letters. «Да» does not. */
export function renewalAnswerBlocksReminders(
  answer: BusinessRenewalAnswer | null | undefined,
): boolean {
  return answer === "no";
}

/** Paying moves the contractual end, so an earlier «Нет» no longer applies. */
export function renewalDeclineApplies(input: {
  answer: BusinessRenewalAnswer | null | undefined;
  answeredPeriodEnd: string | null | undefined;
  contractualEnd: string | null | undefined;
}): boolean {
  if (input.answer !== "no" || !input.answeredPeriodEnd || !input.contractualEnd) return false;
  const answered = Date.parse(input.answeredPeriodEnd);
  const current = Date.parse(input.contractualEnd);
  return Number.isFinite(answered) && answered === current;
}

/**
 * The question is shown from 3 Moscow calendar days before the contractual end, through the
 * 3-day grace, and after a gift ended without payment («offer»). Earlier it would only distract.
 */
export function renewalQuestionVisible(
  access: { mode: string; endsAt: string | null | undefined },
  now: Date,
): boolean {
  if (access.mode === "grace" || access.mode === "offer") return true;
  if (access.mode !== "trial" && access.mode !== "paid") return false;
  if (!access.endsAt) return false;
  const endMs = Date.parse(access.endsAt);
  if (!Number.isFinite(endMs)) return false;
  if (now.getTime() >= endMs) return true;
  return moscowCalendarDaysBetween(now, new Date(endMs)) <= BUSINESS_ACCESS_REMINDER_LEAD_DAYS;
}

export function parseRenewalChoiceHash(hash: string): BusinessRenewalAnswer | null {
  const raw = hash.trim().replace(/^#/, "");
  const split = raw.indexOf("?");
  const path = (split === -1 ? raw : raw.slice(0, split)).trim();
  if (path !== "prodlenie") return null;
  const otvet = new URLSearchParams(split === -1 ? "" : raw.slice(split + 1)).get("otvet");
  if (otvet === "da") return "yes";
  if (otvet === "net") return "no";
  return null;
}

export function normalizeRenewalNote(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, BUSINESS_RENEWAL_NOTE_MAX);
}
