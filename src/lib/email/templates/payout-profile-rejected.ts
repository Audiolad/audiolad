import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailButton,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";

export const PAYOUT_PROFILE_REJECTED_EMAIL_SUBJECT =
  "Не удалось подтвердить данные для выплат";
export const PAYOUT_PROFILE_REJECTED_EMAIL_TEMPLATE_KEY =
  "payout_profile_rejected";
export const PAYOUT_PROFILE_REJECTED_EMAIL_TEMPLATE_VERSION =
  "payout-profile-rejected-v1-20260728";

export type PayoutProfileRejectedEmailInput = {
  authorName?: string | null;
  siteOrigin?: string;
};

export function getPayoutDetailsUrl(siteOrigin: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/author-dashboard/commercial/payout-details`;
}

export function renderPayoutProfileRejectedEmailHtml(
  input: PayoutProfileRejectedEmailInput = {},
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;
  const payoutUrl = getPayoutDetailsUrl(siteOrigin);
  const name = input.authorName?.trim() || "";
  const greeting = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";

  const bodyHtml = [
    renderBrandEmailHeading("Не удалось подтвердить данные для выплат"),
    renderBrandEmailParagraph(greeting, "email-greeting"),
    renderBrandEmailParagraph(
      "К сожалению, мы не смогли подтвердить ваши данные для выплат. Комментарий команды доступен в кабинете автора.",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailButton("Открыть кабинет автора", payoutUrl),
    renderBrandEmailParagraph("С уважением,", "email-body", "24px 0 0"),
    renderBrandEmailParagraph(
      "<strong>Команда АудиоЛад</strong>",
      "email-body",
      "0",
    ),
  ].join("\n\n                ");

  return renderBrandEmailShell({
    title: PAYOUT_PROFILE_REJECTED_EMAIL_SUBJECT,
    preheader: PAYOUT_PROFILE_REJECTED_EMAIL_SUBJECT,
    logoUrl,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Вы получили это письмо, потому что ваши данные для выплат на АудиоЛаде не были подтверждены.",
    ],
  });
}

export function renderPayoutProfileRejectedEmailText(
  input: PayoutProfileRejectedEmailInput = {},
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const payoutUrl = getPayoutDetailsUrl(siteOrigin);
  const name = input.authorName?.trim() || "";
  const greeting = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";

  return [
    PAYOUT_PROFILE_REJECTED_EMAIL_SUBJECT,
    "",
    greeting,
    "",
    "К сожалению, мы не смогли подтвердить ваши данные для выплат. Комментарий команды доступен в кабинете автора.",
    "",
    `Открыть кабинет автора: ${payoutUrl}`,
    "",
    "С уважением,",
    "Команда АудиоЛад",
  ].join("\n");
}
