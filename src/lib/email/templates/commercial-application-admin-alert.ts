import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailCtaWithFallback,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";
import { escapeHtml } from "./escape-html";

export const COMMERCIAL_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_KEY =
  "commercial_application_admin_alert";
export const COMMERCIAL_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION =
  "commercial-application-admin-alert-v2-20260804";

export type CommercialApplicationAdminAlertKind = "submitted" | "updated";

export type CommercialApplicationAdminAlertEmailInput = {
  authorName: string;
  applicationId: string;
  kind?: CommercialApplicationAdminAlertKind;
  siteOrigin?: string;
};

export function buildCommercialApplicationAdminAlertSubject(
  authorName: string,
  kind: CommercialApplicationAdminAlertKind = "submitted",
): string {
  const name = authorName.trim() || "Автор";

  if (kind === "updated") {
    return `Автор обновил коммерческую заявку – ${name}`;
  }

  return `Новая заявка на коммерческий статус – ${name}`;
}

export function getCommercialApplicationAdminDetailUrl(
  applicationId: string,
  siteOrigin?: string,
): string {
  const origin = (siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  return `${origin}/admin/commercial-applications/${applicationId}`;
}

export function renderCommercialApplicationAdminAlertEmailHtml(
  input: CommercialApplicationAdminAlertEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;
  const authorName = input.authorName.trim() || "Автор";
  const kind = input.kind ?? "submitted";
  const detailUrl = getCommercialApplicationAdminDetailUrl(
    input.applicationId,
    siteOrigin,
  );
  const heading =
    kind === "updated"
      ? "Автор обновил коммерческую заявку"
      : "Новая заявка на коммерческий статус";
  const body =
    kind === "updated"
      ? `Автор <strong>${escapeHtml(authorName)}</strong> обновил заявку на коммерческий статус после запроса уточнений.`
      : `Автор <strong>${escapeHtml(authorName)}</strong> отправил заявку на коммерческий статус.`;

  const bodyHtml = [
    renderBrandEmailHeading(heading),
    renderBrandEmailParagraph(body, "email-body", "0 0 16px"),
    renderBrandEmailParagraph(
      "Откройте административную панель, чтобы рассмотреть её.",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailCtaWithFallback(detailUrl, "Рассмотреть заявку"),
  ].join("");

  return renderBrandEmailShell({
    title: heading,
    preheader: buildCommercialApplicationAdminAlertSubject(authorName, kind),
    logoUrl,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Служебное уведомление административной панели АудиоЛад.",
    ],
  });
}

export function renderCommercialApplicationAdminAlertEmailText(
  input: CommercialApplicationAdminAlertEmailInput,
): string {
  const authorName = input.authorName.trim() || "Автор";
  const kind = input.kind ?? "submitted";
  const detailUrl = getCommercialApplicationAdminDetailUrl(
    input.applicationId,
    input.siteOrigin,
  );
  const intro =
    kind === "updated"
      ? `Автор ${authorName} обновил заявку на коммерческий статус после запроса уточнений.`
      : `Автор ${authorName} отправил заявку на коммерческий статус.`;

  return [
    buildCommercialApplicationAdminAlertSubject(authorName, kind),
    "",
    intro,
    "Откройте административную панель, чтобы рассмотреть её.",
    "",
    `Рассмотреть заявку: ${detailUrl}`,
    `Если кнопка не работает, откройте ссылку: ${detailUrl}`,
  ].join("\n");
}
