import { formatMoscowDateTime, ruDaysWord } from "@/lib/access-grants/policy";
import {
  BUSINESS_ACCESS_REMINDER_CABINET_URL,
  type BusinessAccessReminderKind,
} from "@/lib/business/access-reminders";
import { BUSINESS_GRACE_MS, formatBusinessMonthlyPrice } from "@/lib/business/plan";
import {
  BUSINESS_RENEWAL_NO_LABEL,
  BUSINESS_RENEWAL_NO_URL,
  BUSINESS_RENEWAL_QUESTION,
  BUSINESS_RENEWAL_YES_LABEL,
  BUSINESS_RENEWAL_YES_URL,
} from "@/lib/business/renewal-choice";

import {
  BUSINESS_EMAIL_SENDER_NAME,
  renderBusinessEmailChoiceLinks,
  renderBusinessEmailCta,
  renderBusinessEmailParagraph,
  renderBusinessEmailShell,
} from "./business-layout";

export const BUSINESS_ACCESS_REMINDER_TEMPLATE_KEY = "business_access_reminder";
export const BUSINESS_ACCESS_REMINDER_TEMPLATE_VERSION = "business-access-reminder-v5";

export const BUSINESS_ACCESS_REMINDER_BUTTON_LABEL = "Продлить доступ";

const PRICE_LINE = `Продление – ${formatBusinessMonthlyPrice()} за 30 дней, картой или по СБП. Автосписания нет.`;

export const BUSINESS_ACCESS_REMINDER_SUBJECTS = {
  before_end: "АудиоЛад Бизнес – срок доступа подходит к концу",
  grace_start: "АудиоЛад Бизнес – началась отсрочка",
  grace_last: "АудиоЛад Бизнес – последний день отсрочки",
} as const satisfies Record<BusinessAccessReminderKind, string>;

export function businessAccessReminderSubject(kind: BusinessAccessReminderKind): string {
  return BUSINESS_ACCESS_REMINDER_SUBJECTS[kind];
}

export function businessAccessReminderEndsLabel(periodEndIso: string): string | null {
  const end = new Date(periodEndIso);
  if (!Number.isFinite(end.getTime())) return null;
  return formatMoscowDateTime(end);
}

export function businessAccessReminderGraceEndsLabel(periodEndIso: string): string | null {
  const endMs = Date.parse(periodEndIso);
  if (!Number.isFinite(endMs)) return null;
  return formatMoscowDateTime(new Date(endMs + BUSINESS_GRACE_MS));
}

const DAY_MS = 86_400_000;

/**
 * Whole days of grace left at send time, rounded to the nearest day (min 1).
 * An on-time grace_start says 3; a letter sent a day late says 2.
 * The exact end time is always printed next to it.
 */
export function businessAccessReminderGraceDaysLeft(periodEndIso: string, now: Date): number | null {
  const endMs = Date.parse(periodEndIso);
  if (!Number.isFinite(endMs)) return null;
  const left = endMs + BUSINESS_GRACE_MS - now.getTime();
  if (left <= 0) return 0;
  return Math.max(1, Math.round(left / DAY_MS));
}

export function businessAccessReminderGraceDaysPhrase(days: number): string {
  return `${days} ${ruDaysWord(days)}`;
}

export function businessAccessReminderParagraphs(input: {
  kind: BusinessAccessReminderKind;
  endsAtLabel: string;
  graceEndsLabel: string;
  /** Real grace days left at send time; defaults to the full 3. */
  graceDaysLeft?: number;
}): string[] {
  const hello = "Здравствуйте!";
  const closing = `Команда ${BUSINESS_EMAIL_SENDER_NAME}`;
  if (input.kind === "before_end") {
    return [
      hello,
      `Доступ к музыке в АудиоЛад Бизнес действует до ${input.endsAtLabel}. Продлить можно заранее – музыка продолжит играть без перерыва.`,
      PRICE_LINE,
      closing,
    ];
  }
  if (input.kind === "grace_start") {
    return [
      hello,
      `Срок доступа к АудиоЛад Бизнес закончился ${input.endsAtLabel}. Музыка в зале играет ещё ${businessAccessReminderGraceDaysPhrase(Math.max(1, input.graceDaysLeft ?? 3))} – до ${input.graceEndsLabel}.`,
      PRICE_LINE,
      closing,
    ];
  }
  return [
    hello,
    `Последний день отсрочки: музыка в АудиоЛад Бизнес играет до ${input.graceEndsLabel}. Кабинет и настройки сохранятся.`,
    PRICE_LINE,
    closing,
  ];
}

export function renderBusinessAccessReminderEmailText(input: {
  kind: BusinessAccessReminderKind;
  endsAtLabel: string;
  graceEndsLabel: string;
  graceDaysLeft?: number;
}): string {
  const paragraphs = businessAccessReminderParagraphs(input);
  const [hello, body, price, closing] = paragraphs;
  return [
    hello,
    "",
    body,
    "",
    price,
    "",
    `${BUSINESS_ACCESS_REMINDER_BUTTON_LABEL}: ${BUSINESS_ACCESS_REMINDER_CABINET_URL}`,
    "",
    BUSINESS_RENEWAL_QUESTION,
    `${BUSINESS_RENEWAL_YES_LABEL}: ${BUSINESS_RENEWAL_YES_URL}`,
    `${BUSINESS_RENEWAL_NO_LABEL}: ${BUSINESS_RENEWAL_NO_URL}`,
    "",
    closing,
  ].join("\n");
}

export function renderBusinessAccessReminderEmailHtml(input: {
  kind: BusinessAccessReminderKind;
  endsAtLabel: string;
  graceEndsLabel: string;
  graceDaysLeft?: number;
}): string {
  const paragraphs = businessAccessReminderParagraphs(input);
  const [hello, body, price, closing] = paragraphs;
  const subject = businessAccessReminderSubject(input.kind);
  const bodyHtml = [
    renderBusinessEmailParagraph(hello, "0 0 16px"),
    renderBusinessEmailParagraph(body, "0 0 16px"),
    renderBusinessEmailParagraph(price, "0 0 8px"),
    renderBusinessEmailCta(
      BUSINESS_ACCESS_REMINDER_CABINET_URL,
      BUSINESS_ACCESS_REMINDER_BUTTON_LABEL,
    ),
    renderBusinessEmailParagraph(BUSINESS_RENEWAL_QUESTION, "8px 0 8px"),
    renderBusinessEmailChoiceLinks([
      { href: BUSINESS_RENEWAL_YES_URL, label: BUSINESS_RENEWAL_YES_LABEL },
      { href: BUSINESS_RENEWAL_NO_URL, label: BUSINESS_RENEWAL_NO_LABEL },
    ]),
    renderBusinessEmailParagraph(closing, "16px 0 0"),
  ].join("");

  return renderBusinessEmailShell({
    title: subject,
    preheader: subject,
    bodyHtml,
    footerLines: [`© ${BUSINESS_EMAIL_SENDER_NAME}`],
    versionComment: BUSINESS_ACCESS_REMINDER_TEMPLATE_VERSION,
  });
}
