import { getAppOrigin } from "@/lib/seo/app-origin";

import { escapeHtml } from "./escape-html";
import {
  renderBrandEmailCtaWithFallback,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";

export const AUTHOR_PRODUCT_MODERATION_ADMIN_ALERT_EMAIL_TEMPLATE_KEY =
  "author_product_moderation_admin_alert";
export const AUTHOR_PRODUCT_MODERATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION =
  "author-product-moderation-admin-alert-v1-20260804";

export type AuthorProductModerationAdminAlertKind =
  | "submitted"
  | "resubmitted";

export type AuthorProductModerationAdminAlertEmailInput = {
  productId: string;
  productTitle: string;
  authorName: string;
  authorProjectName: string;
  productKindLabel: string;
  priceLabel: string;
  audioTrackCount: number;
  submissionKindLabel: string;
  submittedAtLabel: string;
  kind: AuthorProductModerationAdminAlertKind;
  siteOrigin?: string;
};

export function buildAuthorProductModerationAdminAlertSubject(
  productTitle: string,
  kind: AuthorProductModerationAdminAlertKind,
): string {
  const title = productTitle.trim() || "Без названия";

  if (kind === "resubmitted") {
    return `Продукт повторно отправлен на модерацию — ${title}`;
  }

  return `Новый продукт на модерации — ${title}`;
}

export function getAuthorProductModerationAdminDetailUrl(
  productId: string,
  siteOrigin?: string,
): string {
  const origin = (siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  return `${origin}/admin/product-moderation/${productId}`;
}

export function renderAuthorProductModerationAdminAlertEmailHtml(
  input: AuthorProductModerationAdminAlertEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;
  const title = input.productTitle.trim() || "Без названия";
  const authorName = input.authorName.trim() || "Автор";
  const detailUrl = getAuthorProductModerationAdminDetailUrl(
    input.productId,
    siteOrigin,
  );
  const heading =
    input.kind === "resubmitted"
      ? "Продукт повторно отправлен на модерацию"
      : "Новый продукт отправлен на модерацию";
  const intro =
    input.kind === "resubmitted"
      ? `Автор <strong>${escapeHtml(authorName)}</strong> внёс изменения и повторно отправил продукт на модерацию.`
      : `Автор <strong>${escapeHtml(authorName)}</strong> отправил продукт на модерацию.`;

  const details = [
    `<strong>Название продукта:</strong> ${escapeHtml(title)}`,
    `<strong>Авторский проект:</strong> ${escapeHtml(input.authorProjectName)}`,
    `<strong>Тип:</strong> ${escapeHtml(input.productKindLabel)}`,
    `<strong>Стоимость:</strong> ${escapeHtml(input.priceLabel)}`,
    `<strong>Количество аудиотреков:</strong> ${escapeHtml(String(input.audioTrackCount))}`,
    `<strong>Дата и время отправки (МСК):</strong> ${escapeHtml(input.submittedAtLabel)}`,
    `<strong>Отправка:</strong> ${escapeHtml(input.submissionKindLabel)}`,
  ];

  const bodyHtml = [
    renderBrandEmailHeading(heading),
    renderBrandEmailParagraph(intro, "email-body", "0 0 16px"),
    renderBrandEmailParagraph(details.join("<br><br>"), "email-body", "0 0 24px"),
    renderBrandEmailCtaWithFallback(detailUrl, "Открыть модерацию"),
  ].join("");

  return renderBrandEmailShell({
    title: heading,
    preheader: buildAuthorProductModerationAdminAlertSubject(title, input.kind),
    logoUrl,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Служебное уведомление административной панели АудиоЛад.",
    ],
  });
}

export function renderAuthorProductModerationAdminAlertEmailText(
  input: AuthorProductModerationAdminAlertEmailInput,
): string {
  const title = input.productTitle.trim() || "Без названия";
  const authorName = input.authorName.trim() || "Автор";
  const detailUrl = getAuthorProductModerationAdminDetailUrl(
    input.productId,
    input.siteOrigin,
  );
  const intro =
    input.kind === "resubmitted"
      ? `Автор ${authorName} внёс изменения и повторно отправил продукт на модерацию.`
      : `Автор ${authorName} отправил продукт на модерацию.`;

  return [
    buildAuthorProductModerationAdminAlertSubject(title, input.kind),
    "",
    intro,
    "",
    `Название продукта: ${title}`,
    `Авторский проект: ${input.authorProjectName}`,
    `Тип: ${input.productKindLabel}`,
    `Стоимость: ${input.priceLabel}`,
    `Количество аудиотреков: ${input.audioTrackCount}`,
    `Дата и время отправки (МСК): ${input.submittedAtLabel}`,
    `Отправка: ${input.submissionKindLabel}`,
    "",
    `Открыть модерацию: ${detailUrl}`,
    `Если кнопка не работает, откройте ссылку: ${detailUrl}`,
  ].join("\n");
}
