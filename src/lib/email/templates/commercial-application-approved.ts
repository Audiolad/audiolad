import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailButton,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";

export const COMMERCIAL_APPLICATION_APPROVED_EMAIL_SUBJECT =
  "Коммерческий кабинет АудиоЛада одобрен";
export const COMMERCIAL_APPLICATION_APPROVED_EMAIL_TEMPLATE_KEY =
  "commercial_application_approved";
export const COMMERCIAL_APPLICATION_APPROVED_EMAIL_TEMPLATE_VERSION =
  "commercial-application-approved-v1-20260727";

export type CommercialApplicationApprovedEmailInput = {
  authorName?: string | null;
  siteOrigin?: string;
};

export function getCommercialOnboardingUrl(siteOrigin: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/author-dashboard`;
}

export function renderCommercialApplicationApprovedEmailHtml(
  input: CommercialApplicationApprovedEmailInput = {},
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;
  const onboardingUrl = getCommercialOnboardingUrl(siteOrigin);
  const name = input.authorName?.trim() || "";
  const greeting = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";

  const bodyHtml = [
    renderBrandEmailHeading("Коммерческий кабинет одобрен"),
    renderBrandEmailParagraph(greeting, "email-greeting"),
    renderBrandEmailParagraph(
      "Мы рассмотрели вашу заявку и одобрили подключение коммерческих возможностей в кабинете автора <strong>АудиоЛада</strong>.",
      "email-body",
    ),
    renderBrandEmailParagraph(
      "Чтобы начать размещать платные аудиопродукты, выполните два следующих шага:",
      "email-body",
      "0 0 8px",
    ),
    renderBrandEmailParagraph(
      "1. Заполните данные для получения авторского вознаграждения.",
      "email-body",
      "0 0 6px",
    ),
    renderBrandEmailParagraph(
      "2. Ознакомьтесь с условиями сотрудничества и примите их.",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailParagraph(
      "После завершения этих шагов вам станет доступно создание первого платного продукта.",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailButton(onboardingUrl, "Продолжить подключение", {
      msoWidth: 320,
    }),
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
  const onboardingUrl = getCommercialOnboardingUrl(siteOrigin);
  const name = input.authorName?.trim() || "";
  const greeting = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";

  return [
    COMMERCIAL_APPLICATION_APPROVED_EMAIL_SUBJECT,
    "",
    greeting,
    "",
    "Мы рассмотрели вашу заявку и одобрили подключение коммерческих возможностей в кабинете автора АудиоЛада.",
    "",
    "Чтобы начать размещать платные аудиопродукты, выполните два следующих шага:",
    "1. Заполните данные для получения авторского вознаграждения.",
    "2. Ознакомьтесь с условиями сотрудничества и примите их.",
    "",
    "После завершения этих шагов вам станет доступно создание первого платного продукта.",
    "",
    `Продолжить подключение: ${onboardingUrl}`,
    "",
    "С уважением,",
    "Команда АудиоЛад",
  ].join("\n");
}
