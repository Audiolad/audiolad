import { getAppOrigin } from "../../seo/app-origin";
import { resolveAuthorProductModerationAbsoluteUrl } from "../author-product-moderation-context";

import { escapeHtml } from "./escape-html";
import {
  renderBrandEmailButton,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";

export const AUTHOR_PRODUCT_MODERATION_APPROVED_EMAIL_SUBJECT =
  "Ваш продукт опубликован – АудиоЛад";
export const AUTHOR_PRODUCT_MODERATION_APPROVED_EMAIL_TEMPLATE_KEY =
  "author_product_moderation_approved";
export const AUTHOR_PRODUCT_MODERATION_APPROVED_EMAIL_TEMPLATE_VERSION =
  "author-product-moderation-approved-v1-20260801";

export type AuthorProductModerationApprovedEmailInput = {
  authorName?: string | null;
  productTitle: string;
  authorDashboardPath: string;
  /** Public product page. May be absent only if the slug snapshot is missing. */
  publicProductPath?: string | null;
  siteOrigin?: string;
};

function resolveCtaPath(input: AuthorProductModerationApprovedEmailInput): string {
  return input.publicProductPath?.trim() || input.authorDashboardPath;
}

export function renderAuthorProductModerationApprovedEmailHtml(
  input: AuthorProductModerationApprovedEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;
  const ctaUrl = resolveAuthorProductModerationAbsoluteUrl(
    siteOrigin,
    resolveCtaPath(input),
  );
  const name = input.authorName?.trim() || "";
  const greeting = name
    ? `Здравствуйте, ${escapeHtml(name)}!`
    : "Здравствуйте!";

  const bodyHtml = [
    renderBrandEmailHeading(AUTHOR_PRODUCT_MODERATION_APPROVED_EMAIL_SUBJECT),
    renderBrandEmailParagraph(greeting, "email-greeting"),
    renderBrandEmailParagraph(
      `Модератор АудиоЛада одобрил продукт «${escapeHtml(
        input.productTitle,
      )}». Он уже опубликован и доступен покупателям на платформе.`,
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailButton(ctaUrl, "Открыть продукт"),
    renderBrandEmailParagraph("С уважением,", "email-body", "24px 0 0"),
    renderBrandEmailParagraph("<strong>Команда АудиоЛад</strong>", "email-body", "0"),
  ].join("\n\n                ");

  return renderBrandEmailShell({
    title: AUTHOR_PRODUCT_MODERATION_APPROVED_EMAIL_SUBJECT,
    preheader: `Продукт «${input.productTitle}» опубликован`,
    logoUrl,
    bodyHtml,
    footerLines: ["© АудиоЛад, 2026. Все права защищены."],
  });
}

export function renderAuthorProductModerationApprovedEmailText(
  input: AuthorProductModerationApprovedEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const ctaUrl = resolveAuthorProductModerationAbsoluteUrl(
    siteOrigin,
    resolveCtaPath(input),
  );
  const name = input.authorName?.trim() || "";
  const greeting = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";

  return [
    AUTHOR_PRODUCT_MODERATION_APPROVED_EMAIL_SUBJECT,
    "",
    greeting,
    "",
    `Модератор АудиоЛада одобрил продукт «${input.productTitle}». Он уже опубликован и доступен покупателям на платформе.`,
    "",
    `Открыть продукт: ${ctaUrl}`,
    "",
    "С уважением,",
    "Команда АудиоЛад",
  ].join("\n");
}
