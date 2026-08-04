import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailButton,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";

export const PAYOUT_PROFILE_VERIFIED_EMAIL_SUBJECT =
  "Данные для выплат подтверждены";
export const PAYOUT_PROFILE_VERIFIED_EMAIL_TEMPLATE_KEY =
  "payout_profile_verified";
export const PAYOUT_PROFILE_VERIFIED_EMAIL_TEMPLATE_VERSION =
  "payout-profile-verified-v1-20260728";

export type PayoutProfileVerifiedEmailInput = {
  authorName?: string | null;
  siteOrigin?: string;
};

export function getAuthorDashboardUrl(siteOrigin: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/author-dashboard`;
}

export function renderPayoutProfileVerifiedEmailHtml(
  input: PayoutProfileVerifiedEmailInput = {},
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;
  const dashboardUrl = getAuthorDashboardUrl(siteOrigin);
  const name = input.authorName?.trim() || "";
  const greeting = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";

  const bodyHtml = [
    renderBrandEmailHeading("Данные для выплат подтверждены"),
    renderBrandEmailParagraph(greeting, "email-greeting"),
    renderBrandEmailParagraph(
      "Мы проверили и подтвердили ваши данные для выплат. Продолжайте подключение коммерческого кабинета в личном кабинете автора.",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailButton(dashboardUrl, "Открыть кабинет автора"),
    renderBrandEmailParagraph("С уважением,", "email-body", "24px 0 0"),
    renderBrandEmailParagraph(
      "<strong>Команда АудиоЛад</strong>",
      "email-body",
      "0",
    ),
  ].join("\n\n                ");

  return renderBrandEmailShell({
    title: PAYOUT_PROFILE_VERIFIED_EMAIL_SUBJECT,
    preheader: PAYOUT_PROFILE_VERIFIED_EMAIL_SUBJECT,
    logoUrl,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Вы получили это письмо, потому что ваши данные для выплат на АудиоЛаде были подтверждены.",
    ],
  });
}

export function renderPayoutProfileVerifiedEmailText(
  input: PayoutProfileVerifiedEmailInput = {},
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const dashboardUrl = getAuthorDashboardUrl(siteOrigin);
  const name = input.authorName?.trim() || "";
  const greeting = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";

  return [
    PAYOUT_PROFILE_VERIFIED_EMAIL_SUBJECT,
    "",
    greeting,
    "",
    "Мы проверили и подтвердили ваши данные для выплат. Продолжайте подключение коммерческого кабинета в личном кабинете автора.",
    "",
    `Открыть кабинет автора: ${dashboardUrl}`,
    "",
    "С уважением,",
    "Команда АудиоЛад",
  ].join("\n");
}
