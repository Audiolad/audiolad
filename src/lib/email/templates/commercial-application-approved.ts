import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailButton,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";

export const COMMERCIAL_APPLICATION_APPROVED_EMAIL_SUBJECT =
  "Ваш коммерческий статус одобрен";
export const COMMERCIAL_APPLICATION_APPROVED_EMAIL_TEMPLATE_KEY =
  "commercial_application_approved";
export const COMMERCIAL_APPLICATION_APPROVED_EMAIL_TEMPLATE_VERSION =
  "commercial-application-approved-v2-20260921";

export type CommercialApplicationApprovedEmailInput = {
  authorName?: string | null;
  authorSlug?: string | null;
  siteOrigin?: string;
  /** When true, do not ask the author to accept terms again. */
  termsAlreadyAccepted?: boolean;
};

/** Canonical Author Terms acceptance screen in the author cabinet. */
export function getCommercialAuthorTermsUrl(
  siteOrigin: string,
  authorSlug?: string | null,
): string {
  const base = `${siteOrigin.replace(/\/$/, "")}/author-dashboard/commercial/terms`;
  const slug = authorSlug?.trim();
  if (!slug) {
    return base;
  }
  return `${base}?author=${encodeURIComponent(slug)}`;
}

/** Cabinet home — used when terms are already accepted. */
export function getCommercialOnboardingUrl(siteOrigin: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/author-dashboard`;
}

export function renderCommercialApplicationApprovedEmailHtml(
  input: CommercialApplicationApprovedEmailInput = {},
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;
  const name = input.authorName?.trim() || "";
  const greeting = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";
  const termsAlreadyAccepted = input.termsAlreadyAccepted === true;

  const ctaUrl = termsAlreadyAccepted
    ? getCommercialOnboardingUrl(siteOrigin)
    : getCommercialAuthorTermsUrl(siteOrigin, input.authorSlug);
  const ctaLabel = termsAlreadyAccepted
    ? "Открыть кабинет автора"
    : "Принять авторское соглашение";

  const bodyHtml = termsAlreadyAccepted
    ? [
        renderBrandEmailHeading("Коммерческий статус одобрен"),
        renderBrandEmailParagraph(greeting, "email-greeting"),
        renderBrandEmailParagraph(
          "Ваша заявка на коммерческий статус автора на <strong>АудиоЛаде</strong> одобрена.",
          "email-body",
        ),
        renderBrandEmailParagraph(
          "Авторское соглашение уже принято — коммерческий доступ активирован. Можно создавать и публиковать платные продукты.",
          "email-body",
          "0 0 24px",
        ),
        renderBrandEmailButton(ctaUrl, ctaLabel, { msoWidth: 320 }),
        renderBrandEmailParagraph("С уважением,", "email-body", "24px 0 0"),
        renderBrandEmailParagraph(
          "<strong>Команда АудиоЛад</strong>",
          "email-body",
          "0",
        ),
      ].join("\n\n                ")
    : [
        renderBrandEmailHeading("Коммерческий статус одобрен"),
        renderBrandEmailParagraph(greeting, "email-greeting"),
        renderBrandEmailParagraph(
          "Ваша заявка на коммерческий статус автора на <strong>АудиоЛаде</strong> одобрена.",
          "email-body",
        ),
        renderBrandEmailParagraph(
          "Чтобы завершить подключение коммерческого доступа, перейдите в кабинет автора и примите авторское соглашение.",
          "email-body",
          "0 0 24px",
        ),
        renderBrandEmailButton(ctaUrl, ctaLabel, { msoWidth: 320 }),
        renderBrandEmailParagraph("С уважением,", "email-body", "24px 0 0"),
        renderBrandEmailParagraph(
          "<strong>Команда АудиоЛад</strong>",
          "email-body",
          "0",
        ),
      ].join("\n\n                ");

  return renderBrandEmailShell({
    title: COMMERCIAL_APPLICATION_APPROVED_EMAIL_SUBJECT,
    preheader: COMMERCIAL_APPLICATION_APPROVED_EMAIL_SUBJECT,
    logoUrl,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Вы получили это письмо, потому что ваша коммерческая заявка в АудиоЛаде была одобрена.",
    ],
  });
}

export function renderCommercialApplicationApprovedEmailText(
  input: CommercialApplicationApprovedEmailInput = {},
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const name = input.authorName?.trim() || "";
  const greeting = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";
  const termsAlreadyAccepted = input.termsAlreadyAccepted === true;
  const ctaUrl = termsAlreadyAccepted
    ? getCommercialOnboardingUrl(siteOrigin)
    : getCommercialAuthorTermsUrl(siteOrigin, input.authorSlug);
  const ctaLabel = termsAlreadyAccepted
    ? "Открыть кабинет автора"
    : "Принять авторское соглашение";

  if (termsAlreadyAccepted) {
    return [
      COMMERCIAL_APPLICATION_APPROVED_EMAIL_SUBJECT,
      "",
      greeting,
      "",
      "Ваша заявка на коммерческий статус автора на АудиоЛаде одобрена.",
      "",
      "Авторское соглашение уже принято — коммерческий доступ активирован. Можно создавать и публиковать платные продукты.",
      "",
      `${ctaLabel}: ${ctaUrl}`,
      "",
      "С уважением,",
      "Команда АудиоЛад",
    ].join("\n");
  }

  return [
    COMMERCIAL_APPLICATION_APPROVED_EMAIL_SUBJECT,
    "",
    greeting,
    "",
    "Ваша заявка на коммерческий статус автора на АудиоЛаде одобрена.",
    "",
    "Чтобы завершить подключение коммерческого доступа, перейдите в кабинет автора и примите авторское соглашение.",
    "",
    `${ctaLabel}: ${ctaUrl}`,
    "",
    "С уважением,",
    "Команда АудиоЛад",
  ].join("\n");
}
