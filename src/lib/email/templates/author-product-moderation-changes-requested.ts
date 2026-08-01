import { getAppOrigin } from "../../seo/app-origin";
import { resolveAuthorProductModerationAbsoluteUrl } from "../author-product-moderation-context";

import { escapeHtml } from "./escape-html";
import {
  renderBrandEmailButton,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";

export const AUTHOR_PRODUCT_MODERATION_CHANGES_REQUESTED_EMAIL_SUBJECT =
  "Требуются изменения в продукте – АудиоЛад";
export const AUTHOR_PRODUCT_MODERATION_CHANGES_REQUESTED_EMAIL_TEMPLATE_KEY =
  "author_product_moderation_changes_requested";
export const AUTHOR_PRODUCT_MODERATION_CHANGES_REQUESTED_EMAIL_TEMPLATE_VERSION =
  "author-product-moderation-changes-requested-v1-20260801";

export type AuthorProductModerationChangesRequestedEmailInput = {
  authorName?: string | null;
  productTitle: string;
  /** Full moderator comment. Never truncated in HTML or plain text. */
  moderatorComment: string;
  authorDashboardPath: string;
  siteOrigin?: string;
};

function escapeHtmlMultiline(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br />");
}

export function renderAuthorProductModerationChangesRequestedEmailHtml(
  input: AuthorProductModerationChangesRequestedEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;
  const dashboardUrl = resolveAuthorProductModerationAbsoluteUrl(
    siteOrigin,
    input.authorDashboardPath,
  );
  const name = input.authorName?.trim() || "";
  const greeting = name
    ? `Здравствуйте, ${escapeHtml(name)}!`
    : "Здравствуйте!";

  const bodyHtml = [
    renderBrandEmailHeading(AUTHOR_PRODUCT_MODERATION_CHANGES_REQUESTED_EMAIL_SUBJECT),
    renderBrandEmailParagraph(greeting, "email-greeting"),
    renderBrandEmailParagraph(
      `Модератор АудиоЛада вернул продукт «${escapeHtml(
        input.productTitle,
      )}» на доработку. Продукт пока <strong>не опубликован</strong> — покупатели увидят его только после того, как вы внесёте изменения и отправите его на повторную проверку.`,
      "email-body",
      "0 0 16px",
    ),
    renderBrandEmailParagraph(
      `<strong>Комментарий модератора:</strong><br />${escapeHtmlMultiline(
        input.moderatorComment,
      )}`,
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailButton(dashboardUrl, "Внести изменения"),
    renderBrandEmailParagraph("С уважением,", "email-body", "24px 0 0"),
    renderBrandEmailParagraph("<strong>Команда АудиоЛад</strong>", "email-body", "0"),
  ].join("\n\n                ");

  return renderBrandEmailShell({
    title: AUTHOR_PRODUCT_MODERATION_CHANGES_REQUESTED_EMAIL_SUBJECT,
    preheader: `Продукт «${input.productTitle}» требует изменений`,
    logoUrl,
    bodyHtml,
    footerLines: ["© АудиоЛад, 2026. Все права защищены."],
  });
}

export function renderAuthorProductModerationChangesRequestedEmailText(
  input: AuthorProductModerationChangesRequestedEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const dashboardUrl = resolveAuthorProductModerationAbsoluteUrl(
    siteOrigin,
    input.authorDashboardPath,
  );
  const name = input.authorName?.trim() || "";
  const greeting = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";

  return [
    AUTHOR_PRODUCT_MODERATION_CHANGES_REQUESTED_EMAIL_SUBJECT,
    "",
    greeting,
    "",
    `Модератор АудиоЛада вернул продукт «${input.productTitle}» на доработку. Продукт пока не опубликован — покупатели увидят его только после того, как вы внесёте изменения и отправите его на повторную проверку.`,
    "",
    "Комментарий модератора:",
    input.moderatorComment,
    "",
    `Внести изменения: ${dashboardUrl}`,
    "",
    "С уважением,",
    "Команда АудиоЛад",
  ].join("\n");
}
