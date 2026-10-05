import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";
import { escapeHtml } from "./escape-html";

export const SEO_RESERVATION_5D_REMINDER_EMAIL_TEMPLATE_KEY =
  "seo_reservation_5d_reminder";
export const SEO_RESERVATION_5D_REMINDER_EMAIL_TEMPLATE_VERSION =
  "seo-reservation-5d-reminder-v1-20261005";

export const SEO_RESERVATION_5D_REMINDER_EMAIL_SUBJECT =
  "Напоминание о забронированном запросе на АудиоЛаде";

export type SeoReservation5dReminderEmailInput = {
  queryText: string;
  /** Optional, only when taken from the reservation expires_at column. */
  expiresAtLabel?: string | null;
  siteOrigin?: string;
};

export function buildSeoReservation5dReminderSubject(): string {
  return SEO_RESERVATION_5D_REMINDER_EMAIL_SUBJECT;
}

export function renderSeoReservation5dReminderEmailText(
  input: SeoReservation5dReminderEmailInput,
): string {
  const query = input.queryText.trim() || "запрос";
  const lines = [
    "Здравствуйте!",
    "",
    "Напоминаем, что вы забронировали поисковый запрос:",
    "",
    `«${query}»`,
    "",
    "На подготовку и публикацию продукта даётся 7 дней. Уже прошло 5 дней, поэтому у вас осталось около двух дней, чтобы завершить работу и отправить продукт на модерацию.",
    "",
    "Пожалуйста, не откладывайте публикацию, чтобы сохранить за собой выбранный запрос и выпустить продукт с хорошим поисковым запросом.",
    "",
    "Если продукт уже отправлен на модерацию, ничего делать не нужно.",
  ];
  if (input.expiresAtLabel?.trim()) {
    lines.push("", `Бронь действует до: ${input.expiresAtLabel.trim()} (МСК).`);
  }
  lines.push("", "АудиоЛад", "Платформа авторского аудио");
  return lines.join("\n");
}

export function renderSeoReservation5dReminderEmailHtml(
  input: SeoReservation5dReminderEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const query = input.queryText.trim() || "запрос";
  const paragraphs = [
    renderBrandEmailHeading("Напоминание о бронировании"),
    renderBrandEmailParagraph("Здравствуйте!", "email-body", "0 0 16px"),
    renderBrandEmailParagraph(
      "Напоминаем, что вы забронировали поисковый запрос:",
      "email-body",
      "0 0 8px",
    ),
    renderBrandEmailParagraph(
      `«${escapeHtml(query)}»`,
      "email-body",
      "0 0 16px",
    ),
    renderBrandEmailParagraph(
      "На подготовку и публикацию продукта даётся 7 дней. Уже прошло 5 дней, поэтому у вас осталось около двух дней, чтобы завершить работу и отправить продукт на модерацию.",
      "email-body",
      "0 0 16px",
    ),
    renderBrandEmailParagraph(
      "Пожалуйста, не откладывайте публикацию, чтобы сохранить за собой выбранный запрос и выпустить продукт с хорошим поисковым запросом.",
      "email-body",
      "0 0 16px",
    ),
    renderBrandEmailParagraph(
      "Если продукт уже отправлен на модерацию, ничего делать не нужно.",
      "email-body",
      "0 0 16px",
    ),
  ];
  if (input.expiresAtLabel?.trim()) {
    paragraphs.push(
      renderBrandEmailParagraph(
        `Бронь действует до: ${escapeHtml(input.expiresAtLabel.trim())} (МСК).`,
        "email-body",
        "0 0 16px",
      ),
    );
  }
  paragraphs.push(
    renderBrandEmailParagraph("АудиоЛад", "email-body", "0 0 4px"),
    renderBrandEmailParagraph(
      "Платформа авторского аудио",
      "email-body",
      "0",
    ),
  );

  return renderBrandEmailShell({
    title: SEO_RESERVATION_5D_REMINDER_EMAIL_SUBJECT,
    preheader: SEO_RESERVATION_5D_REMINDER_EMAIL_SUBJECT,
    logoUrl: `${siteOrigin}/brand/audiolad-logo-horizontal.png`,
    bodyHtml: paragraphs.join(""),
    footerLines: ["© АудиоЛад, 2026. Все права защищены."],
    versionComment: SEO_RESERVATION_5D_REMINDER_EMAIL_TEMPLATE_VERSION,
  });
}
