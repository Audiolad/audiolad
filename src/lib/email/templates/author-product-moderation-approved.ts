import {
  buildPracticePublicPath,
  parsePracticePublicPath,
} from "../../products/paths";
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
  "Ваш продукт опубликован на АудиоЛаде";
export const AUTHOR_PRODUCT_MODERATION_APPROVED_EMAIL_TEMPLATE_KEY =
  "author_product_moderation_approved";
export const AUTHOR_PRODUCT_MODERATION_APPROVED_EMAIL_TEMPLATE_VERSION =
  "author-product-moderation-approved-v2-20260921";

export type AuthorProductModerationApprovedEmailInput = {
  authorName?: string | null;
  productTitle: string;
  authorDashboardPath: string;
  /** Public product page. May be absent only if the slug snapshot is missing. */
  publicProductPath?: string | null;
  authorSlug?: string | null;
  productSlug?: string | null;
  siteOrigin?: string;
};

/**
 * Build the public product href via the canonical path helper.
 * Prefers explicit slugs; otherwise rebuilds from a legacy path snapshot.
 */
export function resolveAuthorProductPublishedPublicPath(input: {
  authorSlug?: string | null;
  productSlug?: string | null;
  publicProductPath?: string | null;
}): string | null {
  const authorSlug = input.authorSlug?.trim() || "";
  const productSlug = input.productSlug?.trim() || "";
  if (authorSlug && productSlug) {
    return buildPracticePublicPath(authorSlug, productSlug);
  }

  const parsed = parsePracticePublicPath(input.publicProductPath);
  if (!parsed) {
    return null;
  }

  return buildPracticePublicPath(parsed.authorSlug, parsed.productSlug);
}

function resolveCtaPath(input: AuthorProductModerationApprovedEmailInput): string {
  return (
    resolveAuthorProductPublishedPublicPath({
      authorSlug: input.authorSlug,
      productSlug: input.productSlug,
      publicProductPath: input.publicProductPath,
    }) ||
    input.authorDashboardPath
  );
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
      `Ваш продукт «${escapeHtml(
        input.productTitle,
      )}» прошёл модерацию и опубликован на АудиоЛаде.`,
      "email-body",
      "0 0 12px",
    ),
    renderBrandEmailParagraph(
      "Теперь его могут слушать пользователи платформы.",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailButton(ctaUrl, "Смотреть продукт"),
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
    `Ваш продукт «${input.productTitle}» прошёл модерацию и опубликован на АудиоЛаде.`,
    "",
    "Теперь его могут слушать пользователи платформы.",
    "",
    `Смотреть продукт: ${ctaUrl}`,
    "",
    "С уважением,",
    "Команда АудиоЛад",
  ].join("\n");
}
