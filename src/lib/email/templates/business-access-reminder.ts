import { formatMoscowDateTime } from "@/lib/access-grants/policy";
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
export const BUSINESS_ACCESS_REMINDER_TEMPLATE_VERSION = "business-access-reminder-v4";

export const BUSINESS_ACCESS_REMINDER_BUTTON_LABEL = "Продлить доступ";

const PRICE_LINE = `Продление – ${formatBusinessMonthlyPrice()} за 30 дней, картой или по СБП. Автосписания нет.`;

export const BUSINESS_ACCESS_REMINDER_SUBJECTS = {
  before_end: "АудиоЛад Бизнес – срок доступа подходит к концу",
  grace_start: "АудиоЛад Бизнес – музыка играет ещё 3 дня",
  grace_last: "АудиоЛад Бизнес – сегодня последний день отсрочки",
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
      `Доступ к музыке в АудиоЛад Бизнес действует до ${input.endsAtLabel}. Продлить можно заранее – музыка продолжит играть без перерыва.`,
      PRICE_LINE,
      closing,
    ];
  }
  if (input.kind === "grace_start") {
    return [
      hello,
      `Срок доступа к АудиоЛад Бизнес закончился ${input.endsAtLabel}. Музыка в зале играет ещё 3 дня – до ${input.graceEndsLabel}.`,
      PRICE_LINE,
      closing,
    ];
  }
  return [
    hello,
    `Сегодня последний день отсрочки: музыка в АудиоЛад Бизнес играет до ${input.graceEndsLabel}. Кабинет и настройки сохранятся.`,
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
