import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailCtaWithFallback,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";
import { escapeHtml } from "./escape-html";

export const AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_KEY =
  "author_application_admin_alert";
export const AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION =
  "author-application-admin-alert-v2-20260804";

export type AuthorApplicationAdminAlertEmailInput = {
  applicationId: string;
  displayName: string;
  contactEmail: string;
  contactDetails: string;
  direction: string;
  submittedAtLabel: string;
  siteOrigin?: string;
};

export function buildAuthorApplicationAdminAlertSubject(
  displayName: string,
): string {
  return `Новая заявка на авторство – ${displayName.trim() || "Автор"}`;
}

export function getAuthorApplicationAdminDetailUrl(
  applicationId: string,
  siteOrigin?: string,
): string {
  const origin = (siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  return `${origin}/admin/author-applications/${applicationId}`;
}

export function renderAuthorApplicationAdminAlertEmailHtml(
  input: AuthorApplicationAdminAlertEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const detailUrl = getAuthorApplicationAdminDetailUrl(
    input.applicationId,
    siteOrigin,
  );
  const displayName = input.displayName.trim() || "Автор";
  const bodyHtml = [
    renderBrandEmailHeading("Новая заявка на авторство"),
    renderBrandEmailParagraph(
      `Автор <strong>${escapeHtml(displayName)}</strong> отправил заявку на авторство.`,
      "email-body",
      "0 0 16px",
    ),
    renderBrandEmailParagraph(
      [
        `<strong>Имя / псевдоним:</strong> ${escapeHtml(displayName)}`,
        `<strong>Контакты:</strong> ${escapeHtml(input.contactEmail)}${input.contactDetails.trim() ? `<br>${escapeHtml(input.contactDetails)}` : ""}`,
        `<strong>Тематика:</strong> ${escapeHtml(input.direction)}`,
        `<strong>Дата подачи:</strong> ${escapeHtml(input.submittedAtLabel)}`,
      ].join("<br><br>"),
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailCtaWithFallback(detailUrl, "Открыть заявку"),
  ].join("");

  return renderBrandEmailShell({
    title: "Новая заявка на авторство",
    preheader: buildAuthorApplicationAdminAlertSubject(displayName),
    logoUrl: `${siteOrigin}/brand/audiolad-logo-horizontal.png`,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Служебное уведомление административной панели АудиоЛад.",
    ],
  });
}

export function renderAuthorApplicationAdminAlertEmailText(
  input: AuthorApplicationAdminAlertEmailInput,
): string {
  const displayName = input.displayName.trim() || "Автор";
  const detailUrl = getAuthorApplicationAdminDetailUrl(
    input.applicationId,
    input.siteOrigin,
  );

  return [
    buildAuthorApplicationAdminAlertSubject(displayName),
    "",
    `Имя / псевдоним: ${displayName}`,
    `Контакты: ${input.contactEmail}${input.contactDetails.trim() ? `; ${input.contactDetails}` : ""}`,
    `Тематика: ${input.direction}`,
    `Дата подачи: ${input.submittedAtLabel}`,
    "",
    `Открыть заявку: ${detailUrl}`,
    `Если кнопка не работает, откройте ссылку: ${detailUrl}`,
  ].join("\n");
}
