import { formatMoscowDateTime } from "@/lib/access-grants/policy";
import {
  BUSINESS_ACCESS_REMINDER_CABINET_URL,
  type BusinessAccessReminderKind,
} from "@/lib/business/access-reminders";
import { BUSINESS_GRACE_MS, formatBusinessMonthlyPrice } from "@/lib/business/plan";

import {
  BUSINESS_EMAIL_SENDER_NAME,
  renderBusinessEmailCta,
  renderBusinessEmailParagraph,
  renderBusinessEmailShell,
} from "./business-layout";

export const BUSINESS_ACCESS_REMINDER_TEMPLATE_KEY = "business_access_reminder";
export const BUSINESS_ACCESS_REMINDER_TEMPLATE_VERSION = "business-access-reminder-v3";

export const BUSINESS_ACCESS_REMINDER_BUTTON_LABEL = "Продлить доступ";

const PRICE_LINE = `Продление – ${formatBusinessMonthlyPrice()} за 30 дней, картой или по СБП. Автосписания нет.`;

/** Same sentence as BUSINESS_GRACE_PAYMENT_ANCHOR in the cabinet. */
export const BUSINESS_GRACE_PAYMENT_ANCHOR =
  "Новые 30 дней считаются от конца прошлого срока – не от момента платежа.";

export const BUSINESS_ACCESS_REMINDER_SUBJECTS = {
  before_end: "Скоро закончится доступ к АудиоЛад Бизнес",
  grace_start: "Доступ закончился – музыка ещё играет 3 дня",
  grace_last: "Последний день, когда музыка ещё играет",
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

export function businessAccessReminderParagraphs(input: {
  kind: BusinessAccessReminderKind;
  endsAtLabel: string;
  graceEndsLabel: string;
}): string[] {
  const hello = "Здравствуйте!";
  const closing = `Команда ${BUSINESS_EMAIL_SENDER_NAME}`;
  if (input.kind === "before_end") {
    return [
      hello,
      `Доступ к музыке в АудиоЛад Бизнес действует до ${input.endsAtLabel}. Скоро он закончится – пусть зал не останется без музыки.`,
      PRICE_LINE,
      closing,
    ];
  }
  if (input.kind === "grace_start") {
    return [
      hello,
      `Срок доступа к АудиоЛад Бизнес закончился ${input.endsAtLabel}. Музыка в зале ещё играет – отсрочка составляет 3 дня, затем она остановится. ${BUSINESS_GRACE_PAYMENT_ANCHOR}`,
      PRICE_LINE,
      closing,
    ];
  }
  return [
    hello,
    `Это последний день отсрочки. Музыка в АудиоЛад Бизнес играет до ${input.graceEndsLabel}, затем плеер остановится. Кабинет и настройки сохранятся. ${BUSINESS_GRACE_PAYMENT_ANCHOR}`,
    PRICE_LINE,
    closing,
  ];
}

export function renderBusinessAccessReminderEmailText(input: {
  kind: BusinessAccessReminderKind;
  endsAtLabel: string;
  graceEndsLabel: string;
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
    closing,
  ].join("\n");
}

export function renderBusinessAccessReminderEmailHtml(input: {
  kind: BusinessAccessReminderKind;
  endsAtLabel: string;
  graceEndsLabel: string;
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
